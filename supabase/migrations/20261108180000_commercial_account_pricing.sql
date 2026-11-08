-- LEN0009 phase 2: price a pair with a retail optician's rules. The catalog engine is
-- unchanged (retail prices, overrides, graduation surcharges); the account rules are
-- applied on its result:
--   * catalog item with a fixed account price → that price and currency;
--   * otherwise the general discount on the catalog price;
--   * graduation surcharges get the discount (they have no fixed price).
-- calculate_sale_price gains an optional account so manual adjustments (with reason, the
-- 10 % owner rule) are measured against the account price. Retail calls pass no account
-- and get exactly the previous result.

create function private.apply_account_prices(
  pricing jsonb,
  target_organization_id bigint,
  target_account_id bigint,
  usd_to_cup_rate numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account public.commercial_accounts%rowtype;
  line jsonb;
  fixed public.commercial_account_prices%rowtype;
  adjusted jsonb := '[]'::jsonb;
  totals jsonb := '{}'::jsonb;
  amount numeric(14,2);
  currency text;
  source text;
  factor numeric;
  cup_equivalent numeric(14,2);
begin
  -- Prices are owner data: only members who can sell for the organization get them.
  if not (private.has_organization_role(target_organization_id, array['owner', 'seller']) or private.is_platform_admin()) then
    raise exception using errcode = '42501', message = 'No puedes calcular precios para esta organización.';
  end if;

  select * into account
  from public.commercial_accounts
  where id = target_account_id and organization_id = target_organization_id and archived_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'La óptica minorista no está disponible.';
  end if;
  factor := 1 - account.discount_percent / 100;

  for line in select value from jsonb_array_elements(pricing->'lineItems') loop
    amount := (line->>'amount')::numeric;
    currency := line->>'currency';
    source := case when account.discount_percent > 0 then 'account_discount' else 'catalog' end;

    if line->>'kind' = 'catalog_item' then
      select * into fixed
      from public.commercial_account_prices
      where account_id = account.id and catalog_item_id = (line->>'itemId')::bigint;
      if found then
        amount := fixed.sale_price;
        currency := fixed.currency;
        source := 'account_fixed';
      else
        amount := round(amount * factor, 2);
      end if;
    else
      amount := round(amount * factor, 2);
    end if;

    adjusted := adjusted || jsonb_build_array(line || jsonb_build_object(
      'catalogAmount', line->'amount',
      'catalogCurrency', line->'currency',
      'amount', amount,
      'currency', currency,
      'priceSource', source
    ));
    totals := jsonb_set(totals, array[currency], to_jsonb(coalesce((totals->>currency)::numeric, 0) + amount), true);
  end loop;

  if usd_to_cup_rate is not null then
    cup_equivalent := coalesce((totals->>'CUP')::numeric, 0) + coalesce((totals->>'USD')::numeric, 0) * usd_to_cup_rate;
  end if;

  return pricing || jsonb_build_object(
    'lineItems', adjusted,
    'totals', totals,
    'cupEquivalent', cup_equivalent,
    'commercialAccountId', account.id,
    'accountDiscountPercent', account.discount_percent
  );
end;
$$;

revoke all on function private.apply_account_prices(jsonb, bigint, bigint, numeric) from public, anon;
grant execute on function private.apply_account_prices(jsonb, bigint, bigint, numeric) to authenticated;

-- Same body as 20260921015206 plus the optional account (applied before adjustments).
drop function public.calculate_sale_price(bigint, bigint[], bigint, numeric, jsonb);

create function public.calculate_sale_price(
  target_organization_id bigint,
  selected_item_ids bigint[],
  target_prescription_revision_id bigint,
  usd_to_cup_rate numeric,
  line_adjustments jsonb default '{}'::jsonb,
  target_account_id bigint default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  pricing jsonb;
  line jsonb;
  adjustment jsonb;
  adjusted_lines jsonb := '[]'::jsonb;
  totals jsonb := '{}'::jsonb;
  base_amount numeric(14,2);
  agreed_amount numeric(14,2);
  current_total numeric(14,2);
  reason text;
  actor_is_owner boolean;
  authorization_actor uuid;
  cup_equivalent numeric(14,2);
begin
  if line_adjustments is null or jsonb_typeof(line_adjustments) <> 'object' then
    raise exception using errcode = '22023', message = 'Los ajustes de precio no tienen un formato válido.';
  end if;

  pricing := public.calculate_catalog_price(
    target_organization_id,
    selected_item_ids,
    target_prescription_revision_id,
    usd_to_cup_rate
  );
  if target_account_id is not null then
    pricing := private.apply_account_prices(pricing, target_organization_id, target_account_id, usd_to_cup_rate);
  end if;
  actor_is_owner := private.is_platform_admin()
    or private.has_organization_role(target_organization_id, array['owner']);

  for line in select value from jsonb_array_elements(pricing->'lineItems') loop
    base_amount := (line->>'amount')::numeric;
    agreed_amount := base_amount;
    reason := null;
    authorization_actor := null;

    if line->>'kind' = 'catalog_item' then
      adjustment := line_adjustments -> (line->>'itemId');
      if adjustment is not null then
        begin
          agreed_amount := (adjustment->>'amount')::numeric;
        exception when others then
          raise exception using errcode = '22023', message = 'El precio acordado debe ser un número válido.';
        end;
        reason := nullif(trim(adjustment->>'reason'), '');
      end if;

      if agreed_amount < 0 then
        raise exception using errcode = '22023', message = 'El precio acordado no puede ser negativo.';
      end if;
      if agreed_amount <> base_amount and (reason is null or char_length(reason) not between 5 and 300) then
        raise exception using errcode = '22023', message = 'Explica el ajuste de precio en al menos 5 caracteres.';
      end if;
      if agreed_amount < base_amount * 0.90 and not actor_is_owner then
        raise exception using errcode = '42501', message = 'Un descuento mayor del 10 % requiere autorización del propietario.';
      end if;
      if agreed_amount < base_amount * 0.90 then
        authorization_actor := (select auth.uid());
      end if;

      line := line || jsonb_build_object(
        'baseAmount', base_amount,
        'amount', agreed_amount,
        'adjustmentReason', reason,
        'adjustedBy', case when agreed_amount <> base_amount then (select auth.uid()) else null end,
        'discountAuthorizedBy', authorization_actor
      );
    else
      line := line || jsonb_build_object('baseAmount', base_amount);
    end if;

    adjusted_lines := adjusted_lines || jsonb_build_array(line);
    current_total := coalesce((totals ->> (line->>'currency'))::numeric, 0) + agreed_amount;
    totals := jsonb_set(totals, array[line->>'currency'], to_jsonb(current_total), true);
  end loop;

  if usd_to_cup_rate is not null then
    cup_equivalent := coalesce((totals ->> 'CUP')::numeric, 0)
      + coalesce((totals ->> 'USD')::numeric, 0) * usd_to_cup_rate;
  end if;

  return pricing || jsonb_build_object(
    'lineItems', adjusted_lines,
    'totals', totals,
    'cupEquivalent', cup_equivalent
  );
end;
$$;

revoke all on function public.calculate_sale_price(bigint, bigint[], bigint, numeric, jsonb, bigint) from public, anon;
grant execute on function public.calculate_sale_price(bigint, bigint[], bigint, numeric, jsonb, bigint) to authenticated;
