-- LEN0006 phase 2: quotations and orders with several pairs.
-- Each pair is priced on its own with the existing engine (calculate_sale_price: its own
-- prescription, graduation surcharges and agreed prices), so the same frame can appear in
-- two pairs. The quotation/order totals and CUP equivalent are the sum of its pairs.
-- save_sale_quotation keeps its signature as a one-pair wrapper for current clients.

-- Prices every pair; validates count, patients and prescriptions. No writes.
create function private.price_quotation_lines(
  target_organization_id bigint,
  target_branch_id bigint,
  target_lines jsonb,
  target_usd_to_cup_rate numeric
)
returns jsonb
language plpgsql
stable
set search_path to ''
as $$
declare
  line jsonb;
  line_number integer := 0;
  patient_id bigint;
  revision_id bigint;
  item_ids bigint[];
  pricing jsonb;
  priced_lines jsonb := '[]'::jsonb;
  totals jsonb := '{}'::jsonb;
  warnings jsonb := '[]'::jsonb;
  cup_total numeric(14,2) := 0;
  currency_key text;
  currency_amount numeric;
begin
  if target_lines is null or jsonb_typeof(target_lines) <> 'array' or jsonb_array_length(target_lines) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Un pedido lleva entre 1 y 10 pares.';
  end if;

  for line in select value from jsonb_array_elements(target_lines) loop
    line_number := line_number + 1;
    begin
      patient_id := (line->>'patientCustomerId')::bigint;
      revision_id := nullif(line->>'prescriptionRevisionId', '')::bigint;
      select coalesce(array_agg(value::bigint), '{}') into item_ids from jsonb_array_elements_text(coalesce(line->'itemIds', '[]'::jsonb));
    exception when others then
      raise exception using errcode = '22023', message = format('El par %s no tiene un formato válido.', line_number);
    end;

    if patient_id is null or not exists (
      select 1 from public.customers
      where id = patient_id and organization_id = target_organization_id and branch_id = target_branch_id and archived_at is null
    ) then
      raise exception using errcode = 'P0002', message = format('Elige un paciente de esta sucursal para el par %s.', line_number);
    end if;
    if revision_id is not null and not exists (
      select 1 from public.prescription_revisions revision
      join public.prescriptions prescription on prescription.id = revision.prescription_id
      where revision.id = revision_id and prescription.customer_id = patient_id and prescription.organization_id = target_organization_id
    ) then
      raise exception using errcode = '22023', message = format('La receta del par %s no es de su paciente.', line_number);
    end if;
    if coalesce(cardinality(item_ids), 0) = 0 then
      raise exception using errcode = '22023', message = format('Elige al menos un concepto para el par %s.', line_number);
    end if;

    pricing := public.calculate_sale_price(
      target_organization_id, item_ids, revision_id, target_usd_to_cup_rate,
      coalesce(line->'lineAdjustments', '{}'::jsonb)
    );

    for currency_key, currency_amount in select key, value::numeric from jsonb_each_text(pricing->'totals') loop
      totals := jsonb_set(totals, array[currency_key], to_jsonb(coalesce((totals->>currency_key)::numeric, 0) + currency_amount), true);
    end loop;
    cup_total := cup_total + coalesce((pricing->>'cupEquivalent')::numeric, 0);
    select warnings || coalesce(jsonb_agg(value || jsonb_build_object('lineNumber', line_number)), '[]'::jsonb)
      into warnings from jsonb_array_elements(pricing->'warnings');

    priced_lines := priced_lines || jsonb_build_array(jsonb_build_object(
      'lineNumber', line_number,
      'patientCustomerId', patient_id,
      'prescriptionRevisionId', revision_id,
      'itemIds', to_jsonb(item_ids),
      'pricing', pricing
    ));
  end loop;

  return jsonb_build_object(
    'lines', priced_lines,
    'totals', totals,
    'usdToCupRate', target_usd_to_cup_rate,
    'cupEquivalent', case when target_usd_to_cup_rate is null then null else cup_total end,
    'warnings', warnings
  );
end;
$$;

-- Saves a quotation with 1–10 pairs for a holder. Retry-safe with quotation_request_id.
-- target_lines: [{patientCustomerId, prescriptionRevisionId, itemIds, lineAdjustments}]
create function public.save_multi_line_quotation(
  target_quotation_id bigint,
  target_organization_id bigint,
  target_branch_id bigint,
  target_customer_id bigint,
  target_lines jsonb,
  target_usd_to_cup_rate numeric,
  target_notes text default null,
  quotation_request_id uuid default null
)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  quote_id bigint := target_quotation_id;
  reused boolean := false;
  pricing jsonb;
  priced_line jsonb;
  item jsonb;
  new_line_id bigint;
  item_position smallint := 0;
begin
  if not private.can_write_seller_sale(target_organization_id, target_branch_id, (select auth.uid())) then
    raise exception using errcode = '42501', message = 'No puedes guardar cotizaciones en esta sucursal.';
  end if;
  if not exists (select 1 from public.customers where id = target_customer_id and organization_id = target_organization_id and branch_id = target_branch_id) then
    raise exception using errcode = 'P0002', message = 'Cliente no disponible.';
  end if;

  if quote_id is null and quotation_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(quotation_request_id::text, 0));
    select quotation.id into quote_id
    from public.quotations quotation
    where quotation.seller_id = (select auth.uid()) and quotation.client_request_id = quotation_request_id;
    reused := found;
  end if;

  pricing := private.price_quotation_lines(target_organization_id, target_branch_id, target_lines, target_usd_to_cup_rate);

  -- A retry carries the same content: return the earlier quotation (pending or accepted).
  if reused then
    return jsonb_build_object('quotationId', quote_id, 'pricing', pricing);
  end if;

  if quote_id is null then
    insert into public.quotations (organization_id, branch_id, customer_id, prescription_revision_id, seller_id, status, usd_to_cup_rate, totals, cup_equivalent, warnings, notes, client_request_id)
    values (
      target_organization_id, target_branch_id, target_customer_id,
      (pricing->'lines'->0->>'prescriptionRevisionId')::bigint, (select auth.uid()), 'awaiting_acceptance',
      target_usd_to_cup_rate, pricing->'totals', (pricing->>'cupEquivalent')::numeric, pricing->'warnings',
      nullif(trim(target_notes), ''), quotation_request_id
    )
    returning id into quote_id;
  else
    update public.quotations set
      customer_id = target_customer_id,
      prescription_revision_id = (pricing->'lines'->0->>'prescriptionRevisionId')::bigint,
      status = 'awaiting_acceptance', usd_to_cup_rate = target_usd_to_cup_rate,
      totals = pricing->'totals', cup_equivalent = (pricing->>'cupEquivalent')::numeric,
      warnings = pricing->'warnings', notes = nullif(trim(target_notes), '')
    where id = quote_id and organization_id = target_organization_id and branch_id = target_branch_id
      and seller_id = (select auth.uid()) and status <> 'accepted'
    returning id into quote_id;
    if quote_id is null then
      raise exception using errcode = 'P0002', message = 'Cotización editable no encontrada.';
    end if;
    -- Concepts go with their line (on delete cascade).
    delete from public.quotation_lines where quotation_id = quote_id;
  end if;

  for priced_line in select value from jsonb_array_elements(pricing->'lines') loop
    insert into public.quotation_lines (quotation_id, organization_id, branch_id, line_number, patient_customer_id, prescription_revision_id, totals, cup_equivalent, warnings)
    values (
      quote_id, target_organization_id, target_branch_id, (priced_line->>'lineNumber')::smallint,
      (priced_line->>'patientCustomerId')::bigint, (priced_line->>'prescriptionRevisionId')::bigint,
      priced_line->'pricing'->'totals', coalesce((priced_line->'pricing'->>'cupEquivalent')::numeric, 0),
      priced_line->'pricing'->'warnings'
    )
    returning id into new_line_id;

    for item in select value from jsonb_array_elements(priced_line->'pricing'->'lineItems') loop
      item_position := item_position + 1;
      insert into public.quotation_items (
        quotation_id, organization_id, branch_id, quotation_line_id, catalog_item_id, line_kind, source_code, category,
        name, base_amount, amount, currency, position, price_adjustment_reason, price_adjusted_by, discount_authorized_by
      ) values (
        quote_id, target_organization_id, target_branch_id, new_line_id, (item->>'itemId')::bigint, item->>'kind',
        coalesce(item->>'code', item->>'ruleCode'), item->>'category', item->>'name',
        (item->>'baseAmount')::numeric, (item->>'amount')::numeric, item->>'currency', item_position,
        item->>'adjustmentReason', (item->>'adjustedBy')::uuid, (item->>'discountAuthorizedBy')::uuid
      );
    end loop;
  end loop;

  return jsonb_build_object('quotationId', quote_id, 'pricing', pricing);
end;
$$;

revoke all on function public.save_multi_line_quotation(bigint, bigint, bigint, bigint, jsonb, numeric, text, uuid) from public, anon;
grant execute on function public.save_multi_line_quotation(bigint, bigint, bigint, bigint, jsonb, numeric, text, uuid) to authenticated;

-- Current single-pair clients: one pair whose patient is the customer. Same response shape.
create or replace function public.save_sale_quotation(target_quotation_id bigint, target_organization_id bigint, target_branch_id bigint, target_customer_id bigint, target_prescription_revision_id bigint, selected_item_ids bigint[], target_usd_to_cup_rate numeric, target_notes text default null::text, target_line_adjustments jsonb default '{}'::jsonb, quotation_request_id uuid default null::uuid)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  result jsonb;
begin
  result := public.save_multi_line_quotation(
    target_quotation_id, target_organization_id, target_branch_id, target_customer_id,
    jsonb_build_array(jsonb_build_object(
      'patientCustomerId', target_customer_id,
      'prescriptionRevisionId', target_prescription_revision_id,
      'itemIds', to_jsonb(coalesce(selected_item_ids, '{}'::bigint[])),
      'lineAdjustments', coalesce(target_line_adjustments, '{}'::jsonb)
    )),
    target_usd_to_cup_rate, target_notes, quotation_request_id
  );
  return jsonb_build_object('quotationId', result->'quotationId', 'pricing', result->'pricing'->'lines'->0->'pricing');
end;
$$;

-- Acceptance re-checks every pair against the catalog and snapshots pairs and concepts.
create or replace function public.accept_quotation(target_quotation_id bigint)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  quotation_record public.quotations%rowtype;
  quotation_line public.quotation_lines%rowtype;
  current_pricing jsonb;
  snapshot_base_lines jsonb;
  current_base_lines jsonb;
  item_ids bigint[];
  new_order_id bigint;
  new_order_number text;
  new_line_id bigint;
begin
  select * into quotation_record from public.quotations where id = target_quotation_id for update;
  if not found or quotation_record.status <> 'awaiting_acceptance' then
    -- Already accepted (the UPDATE policy hides accepted rows from FOR UPDATE): a
    -- retry after a lost response or a concurrent click returns the existing order.
    select sale_order.id, sale_order.order_number into new_order_id, new_order_number
    from public.orders sale_order
    join public.quotations quotation on quotation.id = sale_order.quotation_id
    where sale_order.quotation_id = target_quotation_id
      and private.can_write_seller_sale(quotation.organization_id, quotation.branch_id, quotation.seller_id);
    if found then
      return jsonb_build_object('orderId', new_order_id, 'orderNumber', new_order_number, 'alreadyAccepted', true);
    end if;
    raise exception using errcode = 'P0002', message = 'Cotización pendiente no encontrada.';
  end if;
  if not private.can_write_seller_sale(quotation_record.organization_id, quotation_record.branch_id, quotation_record.seller_id) then
    raise exception using errcode = '42501', message = 'No puedes aceptar esta cotización.';
  end if;
  if not exists (select 1 from public.quotation_lines where quotation_id = quotation_record.id) then
    raise exception using errcode = 'P0002', message = 'La cotización no tiene pares.';
  end if;

  for quotation_line in select * from public.quotation_lines where quotation_id = quotation_record.id order by line_number loop
    select array_agg(catalog_item_id order by position) filter (where catalog_item_id is not null),
      jsonb_agg(jsonb_build_object('kind', line_kind, 'itemId', catalog_item_id, 'code', source_code, 'name', name, 'category', category, 'amount', base_amount, 'currency', currency) order by position)
    into item_ids, snapshot_base_lines
    from public.quotation_items where quotation_line_id = quotation_line.id;
    current_pricing := public.calculate_catalog_price(quotation_record.organization_id, item_ids, quotation_line.prescription_revision_id, quotation_record.usd_to_cup_rate);
    select jsonb_agg(jsonb_build_object('kind', value->>'kind', 'itemId', (value->>'itemId')::bigint, 'code', coalesce(value->>'code', value->>'ruleCode'), 'name', value->>'name', 'category', value->>'category', 'amount', (value->>'amount')::numeric, 'currency', value->>'currency'))
    into current_base_lines from jsonb_array_elements(current_pricing->'lineItems');
    if snapshot_base_lines is distinct from current_base_lines then
      raise exception using errcode = '40001', message = 'Los precios base cambiaron. Actualiza la cotización y confirma nuevamente.';
    end if;
  end loop;

  new_order_number := private.next_order_number(quotation_record.organization_id);
  insert into public.orders (order_number, organization_id, branch_id, customer_id, prescription_revision_id, quotation_id, primary_seller_id, usd_to_cup_rate, totals, cup_equivalent)
  values (new_order_number, quotation_record.organization_id, quotation_record.branch_id, quotation_record.customer_id, quotation_record.prescription_revision_id, quotation_record.id, quotation_record.seller_id, quotation_record.usd_to_cup_rate, quotation_record.totals, quotation_record.cup_equivalent)
  returning id into new_order_id;

  for quotation_line in select * from public.quotation_lines where quotation_id = quotation_record.id order by line_number loop
    insert into public.order_lines (order_id, organization_id, branch_id, line_number, patient_customer_id, prescription_revision_id, totals, cup_equivalent)
    values (new_order_id, quotation_line.organization_id, quotation_line.branch_id, quotation_line.line_number, quotation_line.patient_customer_id, quotation_line.prescription_revision_id, quotation_line.totals, quotation_line.cup_equivalent)
    returning id into new_line_id;
    insert into public.order_items (order_id, organization_id, branch_id, order_line_id, catalog_item_id, line_kind, source_code, category, name, base_amount, amount, currency, position, price_adjustment_reason, price_adjusted_by, discount_authorized_by)
    select new_order_id, organization_id, branch_id, new_line_id, catalog_item_id, line_kind, source_code, category, name, base_amount, amount, currency, position, price_adjustment_reason, price_adjusted_by, discount_authorized_by
    from public.quotation_items where quotation_line_id = quotation_line.id order by position;
  end loop;

  insert into public.order_confirmations (order_id, organization_id, branch_id, confirmed_by, totals, usd_to_cup_rate, cup_equivalent)
  values (new_order_id, quotation_record.organization_id, quotation_record.branch_id, (select auth.uid()), quotation_record.totals, quotation_record.usd_to_cup_rate, quotation_record.cup_equivalent);
  update public.quotations set status = 'accepted', accepted_at = now() where id = quotation_record.id;
  return jsonb_build_object('orderId', new_order_id, 'orderNumber', new_order_number);
end;
$$;
