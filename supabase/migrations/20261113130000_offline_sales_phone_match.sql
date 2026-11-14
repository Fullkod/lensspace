-- LEN0011 fix: the possible-duplicate check compared raw digits, but
-- customer_phones.normalized_phone prefixes 53 to 8-digit numbers, so «5555 0001» did not
-- match «+53 5555 0001». Only private.offline_new_customer changes.

-- New customer from the device payload: {fullName, nationalId?, address?, birthDate?,
-- notes?, messagingConsent?, phones: [{number, label?, whatsappEnabled?}]}.
create or replace function private.offline_new_customer(
  target_organization_id bigint, target_branch_id bigint, sale_id uuid, part text, customer jsonb, inout sale_flags jsonb,
  out customer_id bigint
)
language plpgsql
set search_path to ''
as $$
declare
  duplicates bigint[];
begin
  select array_agg(distinct phone.customer_id) into duplicates
  from public.customer_phones phone
  join public.customers existing on existing.id = phone.customer_id and existing.archived_at is null
  where phone.organization_id = target_organization_id and phone.branch_id = target_branch_id
    and phone.normalized_phone in (
      -- Same rule as customer_phones.normalized_phone: an 8-digit Cuban number gets 53.
      select case when length(digits) = 8 then '53' || digits else digits end
      from (
        select regexp_replace(entry ->> 'number', '[^0-9]', '', 'g') as digits
        from jsonb_array_elements(coalesce(customer -> 'phones', '[]'::jsonb)) entry
      ) typed
    )
    and coalesce((customer ->> 'isRelative')::boolean, false) = false;

  customer_id := public.create_customer_with_phones(
    target_organization_id, target_branch_id, customer ->> 'fullName', private.offline_key(sale_id, part),
    customer ->> 'nationalId', customer ->> 'address', (customer ->> 'birthDate')::date, customer ->> 'notes',
    coalesce((customer ->> 'messagingConsent')::boolean, false), coalesce(customer -> 'phones', '[]'::jsonb)
  );
  if duplicates is not null then
    sale_flags := sale_flags || jsonb_build_array(jsonb_build_object(
      'type', 'possible_duplicate_customer', 'customerId', customer_id, 'name', customer ->> 'fullName', 'existingCustomerIds', to_jsonb(duplicates)
    ));
  end if;
end;
$$;
