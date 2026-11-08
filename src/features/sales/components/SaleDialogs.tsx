"use client";

import { Save, UserPlus } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { CustomerFormFields, customerFormValues, type CustomerPhoneDraft } from "@/features/customers/components";
import { findDuplicateCustomers, type DuplicateCustomer } from "@/features/customers/phone";
import { PrescriptionFormFields } from "@/features/prescriptions/components";
import { friendlyPrescriptionError, prescriptionAttachmentError, prescriptionRevisionValues, validatePrescriptionForm } from "@/features/prescriptions/prescription-validation";
import { uploadPrescriptionOriginal } from "@/features/prescriptions/upload-original";
import { createClient } from "@/lib/supabase/client";
import { friendlyError, isNetworkError } from "@/shared/lib/friendly-error";
import { newRequestId } from "@/shared/utils/request-id";
import { Alert, Button, Dialog, Field, Input } from "@/shared/ui";

import type { SaleCustomer } from "./CustomerSearchPicker";
import type { Revision } from "./sale-types";

export type SaleScope = { id: number; name: string; branchId: number; branchName: string; canOperate: boolean };
type PhoneEntry = { number: string; label: string; whatsappEnabled: boolean };

const emptyPhones = (): CustomerPhoneDraft[] => [{ number: "", label: "Principal", whatsappEnabled: true }];

// Retry-safe customer creation shared by "Nuevo cliente" and "Nuevo familiar".
function useCreateCustomer(scope: SaleScope | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const requestId = useRef<string | null>(null);
  return async (fields: { name: string; phones: PhoneEntry[]; nationalId?: string; address?: string; birthDate?: string | null; notes?: string; messagingConsent?: boolean }) => {
    if (!scope) return { error: "Elige primero la sucursal." };
    requestId.current ??= newRequestId();
    const { data, error } = await supabase.rpc("create_customer_with_phones", {
      target_organization_id: scope.id,
      target_branch_id: scope.branchId,
      customer_full_name: fields.name,
      customer_request_id: requestId.current,
      customer_national_id: fields.nationalId ?? "",
      customer_address: fields.address ?? "",
      customer_birth_date: fields.birthDate ?? null,
      customer_notes: fields.notes ?? "",
      customer_messaging_consent: fields.messagingConsent ?? false,
      phone_entries: fields.phones,
    } as never);
    if (error) {
      if (!isNetworkError(error)) requestId.current = null;
      return { error: friendlyError(error, "No se pudo registrar el cliente.") };
    }
    requestId.current = null;
    return { customer: { id: Number(data), organizationId: scope.id, branchId: scope.branchId, name: fields.name } satisfies SaleCustomer };
  };
}

export function NewCustomerDialog({ open, scope, onClose, onCreated }: { open: boolean; scope: SaleScope | undefined; onClose: () => void; onCreated: (customer: SaleCustomer) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const createCustomer = useCreateCustomer(scope);
  const [name, setName] = useState("");
  const [phones, setPhones] = useState<CustomerPhoneDraft[]>(emptyPhones);
  const [duplicates, setDuplicates] = useState<DuplicateCustomer[] | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function finish(customer: SaleCustomer) {
    setName(""); setPhones(emptyPhones()); setDuplicates(null); setMessage("");
    onCreated(customer);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scope?.canOperate) return setMessage("Esta organización está en modo de solo lectura.");
    const values = customerFormValues(new FormData(event.currentTarget), name, phones);
    if (values.fullName.length < 2 || values.phones.length !== phones.length) return setMessage("Completa el nombre y un teléfono de al menos cinco dígitos.");
    setSaving(true); setMessage("");
    // QA-19: warn about a same-name or same-phone customer once; creating anyway is allowed.
    if (duplicates === null) {
      const matches = await findDuplicateCustomers(supabase, { organizationId: scope.id, branchId: scope.branchId }, values.fullName, values.phones.map(({ number }) => number));
      if (matches.length) {
        setDuplicates(matches);
        setMessage("Ya hay clientes parecidos. Usa uno de ellos o, si es otra persona, pulsa «Crear y seleccionar» de nuevo.");
        setSaving(false);
        return;
      }
    }
    const result = await createCustomer({ ...values, name: values.fullName });
    setSaving(false);
    if ("error" in result) return setMessage(result.error ?? "");
    finish(result.customer);
  }

  return (
    <Dialog open={open} onClose={onClose} eyebrow={scope ? `${scope.name} · ${scope.branchName}` : undefined} title="Nuevo cliente" size="lg" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button type="submit" form="sales-new-customer" formNoValidate icon={UserPlus} disabled={saving}>{saving ? "Guardando…" : "Crear y seleccionar"}</Button>
    </>}>
      <form id="sales-new-customer" onSubmit={submit} className="flex flex-col gap-4">
        <CustomerFormFields fullName={name} onFullNameChange={(value) => { setName(value); setDuplicates(null); }} phones={phones} onPhonesChange={(value) => { setPhones(value); setDuplicates(null); }} />
        {message ? <Alert tone={duplicates?.length ? "warning" : "danger"} role="alert">{message}</Alert> : null}
        {duplicates?.length ? (
          <ul className="flex flex-col divide-y divide-line-soft rounded-control border border-line">
            {duplicates.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                <span className="min-w-0 text-sm"><strong className="text-ink">{match.name}</strong><span className="block text-text-muted">{match.phones.join(" · ") || "Sin teléfono"}</span></span>
                <Button size="sm" variant="secondary" onClick={() => finish(match)}>Usar este cliente</Button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
    </Dialog>
  );
}

// A relative only needs a name: the holder's phone is copied with WhatsApp off, so every
// message keeps going to the holder only.
export function NewRelativeDialog({ open, scope, holder, onClose, onCreated }: { open: boolean; scope: SaleScope | undefined; holder: SaleCustomer | null; onClose: () => void; onCreated: (customer: SaleCustomer) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const createCustomer = useCreateCustomer(scope);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scope?.canOperate || !holder) return setMessage("Elige primero el titular de la venta.");
    if (name.trim().length < 2) return setMessage("Escribe el nombre del familiar.");
    setSaving(true); setMessage("");
    const { data: phoneRows } = await supabase.from("customer_phones").select("phone_number, is_primary").eq("customer_id", holder.id).order("is_primary", { ascending: false }).limit(1);
    const holderPhone = ((phoneRows ?? []) as { phone_number: string }[])[0]?.phone_number;
    if (!holderPhone) {
      setSaving(false);
      return setMessage("El titular no tiene teléfono; regístralo como cliente con «Nuevo cliente».");
    }
    const result = await createCustomer({ name: name.trim(), phones: [{ number: holderPhone, label: `Titular: ${holder.name}`.slice(0, 40), whatsappEnabled: false }], notes: `Familiar de ${holder.name}.` });
    setSaving(false);
    if ("error" in result) return setMessage(result.error ?? "");
    setName("");
    onCreated(result.customer);
  }

  return (
    <Dialog open={open} onClose={onClose} eyebrow={holder ? `Titular: ${holder.name}` : undefined} title="Nuevo familiar" icon={UserPlus} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button type="submit" form="sales-new-relative" disabled={saving}>{saving ? "Guardando…" : "Crear y usar"}</Button>
    </>}>
      <form id="sales-new-relative" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Nombre completo" help="Los avisos de WhatsApp siguen llegando solo al titular.">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} autoComplete="off" />
        </Field>
        {message ? <Alert tone="danger" role="alert">{message}</Alert> : null}
      </form>
    </Dialog>
  );
}

export function NewPrescriptionDialog({ open, scope, patient, onClose, onCreated }: { open: boolean; scope: SaleScope | undefined; patient: SaleCustomer | null; onClose: () => void; onCreated: (revision: Revision, message: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scope?.canOperate || !patient) return setMessage("Selecciona primero el paciente de la receta.");
    const form = new FormData(event.currentTarget);
    const validationError = validatePrescriptionForm(form);
    if (validationError) return setMessage(validationError);
    const attachment = form.get("attachment");
    const attachmentError = prescriptionAttachmentError(attachment);
    if (attachmentError) return setMessage(attachmentError);
    setSaving(true); setMessage("");
    const { data, error } = await supabase.rpc("create_prescription_revision", {
      target_organization_id: scope.id,
      target_branch_id: scope.branchId,
      target_customer_id: patient.id,
      target_prescription_id: null,
      ...prescriptionRevisionValues(form),
      revision_change_reason: "",
    } as never);
    if (error) {
      setSaving(false);
      return setMessage(friendlyPrescriptionError(error.message));
    }
    const result = data as unknown as { prescriptionId: number; revisionId: number };
    const attachmentFailed = attachment instanceof File && attachment.size > 0 &&
      !(await uploadPrescriptionOriginal(supabase, { organizationId: scope.id, branchId: scope.branchId, prescriptionId: result.prescriptionId, revisionId: result.revisionId }, attachment));
    setSaving(false);
    onCreated(
      { id: result.revisionId, organizationId: scope.id, branchId: scope.branchId, customerId: patient.id, label: `Receta #${result.prescriptionId} · ${String(form.get("prescriptionDate"))}` },
      attachmentFailed ? "La receta quedó asociada, pero el original no pudo almacenarse. Puedes adjuntarlo desde Recetas." : "La receta nueva quedó asociada a esta venta.",
    );
  }

  return (
    <Dialog open={open} onClose={onClose} eyebrow={patient?.name ?? "Paciente"} title="Nueva receta" size="lg" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button type="submit" form="sales-new-prescription" formNoValidate icon={Save} disabled={saving}>{saving ? "Guardando…" : "Guardar y asociar"}</Button>
    </>}>
      <form id="sales-new-prescription" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <PrescriptionFormFields organizationId={patient?.organizationId} />
        {message ? <Alert tone="danger" role="alert">{message}</Alert> : null}
      </form>
    </Dialog>
  );
}
