"use client";

import { CircleCheck, Plus, Save, Store, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { friendlyError, isNetworkError } from "@/shared/lib/friendly-error";
import { CustomerFormFields, customerFormValues, type CustomerPhoneDraft } from "@/features/customers/components";
import { findDuplicateCustomers, type DuplicateCustomer } from "@/features/customers/phone";
import { PrescriptionFormFields } from "@/features/prescriptions/components";
import {
  friendlyPrescriptionError,
  prescriptionAttachmentError,
  prescriptionRevisionValues,
  validatePrescriptionForm,
} from "@/features/prescriptions/prescription-validation";
import { uploadPrescriptionOriginal } from "@/features/prescriptions/upload-original";
import { createClient } from "@/lib/supabase/client";
import { newRequestId } from "@/shared/utils/request-id";
import { refreshNavigationCounters } from "@/shared/lib/navigation-counters";
import { ExchangeRateRefresh, FormSelect, type BusinessRate } from "@/shared/components";
import { Alert, Button, Card, Dialog, EmptyState, Field, Input, Steps, Textarea } from "@/shared/ui";

import { AcceptedOrderPanel } from "./AcceptedOrderPanel";
import { CustomerSearchPicker, type SaleCustomer } from "./CustomerSearchPicker";
import { ItemPicker } from "./ItemPicker";
import { QuoteSummary } from "./QuoteSummary";
import type { AcceptedOrder, PriceResult, SaleItem } from "./sale-types";

type Organization = {
  id: number;
  name: string;
  branchId: number;
  branchName: string;
  canOperate: boolean;
  canApproveLargeDiscount: boolean;
};
type Revision = {
  id: number;
  organizationId: number;
  branchId: number;
  customerId: number;
  label: string;
};
type PrescriptionResult = {
  prescriptionId: number;
  revisionId: number;
  revisionNumber: number;
};

type SaleDraft = {
  savedAt: number;
  customer: SaleCustomer;
  revisionId: number;
  selected: number[];
  agreedPrices: Record<number, string>;
  adjustmentReasons: Record<number, string>;
  rate: string;
  notes: string;
};
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

// Per-viewer convenience only (never balances or payments): a reload, a dropped
// connection or a closed tab must not lose the sale being prepared (QA-17).
function readDraft(key: string): SaleDraft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(key) ?? "null") as SaleDraft | null;
    return draft && Date.now() - draft.savedAt < DRAFT_TTL_MS && draft.customer ? draft : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, draft: SaleDraft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable (private mode): the sale still works without a draft */
  }
}

export function SalesWorkspace({
  organizations,
  userId,
  lastRates,
  businessRates,
  recentCustomers,
  initialCustomer,
  initialRevisions,
  items,
}: {
  organizations: Organization[];
  userId: string;
  lastRates: Record<number, number>;
  businessRates: Record<number, BusinessRate>;
  recentCustomers: SaleCustomer[];
  initialCustomer: SaleCustomer | null;
  initialRevisions: Revision[];
  items: SaleItem[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const initialScope =
    organizations.find((entry) => initialCustomer && entry.id === initialCustomer.organizationId && entry.branchId === initialCustomer.branchId) ??
    organizations[0];
  const [scopeKey, setScopeKey] = useState(
    initialScope ? `${initialScope.id}:${initialScope.branchId}` : "",
  );
  const [selectedCustomer, setSelectedCustomer] = useState<SaleCustomer | null>(initialCustomer);
  const [revisionRows, setRevisionRows] = useState<Revision[]>(initialRevisions);
  const [revisionId, setRevisionId] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [agreedPrices, setAgreedPrices] = useState<Record<number, string>>({});
  const [adjustmentReasons, setAdjustmentReasons] = useState<Record<number, string>>({});
  // The stored elTOQUE rate wins over the last order rate; 420 only as a last resort.
  const [adoptedRates, setAdoptedRates] = useState(businessRates);
  const referenceRate = (id: number) => adoptedRates[id]?.rate ?? lastRates[id] ?? 420;
  const [rate, setRate] = useState(String(referenceRate(initialScope?.id ?? 0)));
  const [notes, setNotes] = useState("");
  const [restorable, setRestorable] = useState<SaleDraft | null>(null);
  const [quotationId, setQuotationId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PriceResult | null>(null);
  const [acceptedOrder, setAcceptedOrder] = useState<AcceptedOrder | null>(null);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<"customer" | "prescription" | null>(
    null,
  );
  const [dialogMessage, setDialogMessage] = useState("");
  const [savingQuick, setSavingQuick] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateCustomer[] | null>(null);
  const [newCustomerPhones, setNewCustomerPhones] = useState<CustomerPhoneDraft[]>([{ number: "", label: "Principal", whatsappEnabled: true }]);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  // One id per quotation attempt, kept until the quote changes, so a retry after a
  // lost response reuses the quotation instead of creating another one.
  const quoteRequestId = useRef<string | null>(null);
  // Same idea for the quick customer: a retry after a lost response reuses the customer.
  const customerRequestId = useRef<string | null>(null);

  const organization = organizations.find(
    (entry) => `${entry.id}:${entry.branchId}` === scopeKey,
  );
  const organizationId = organization?.id ?? 0;
  const draftKey = `lensspace:sale-draft:${userId}:${scopeKey}`;
  const lastRate = referenceRate(organizationId);
  const rateValue = Number(rate);
  const rateWarning = !rate || !Number.isFinite(rateValue) || rateValue <= 0
    ? "Indica una tasa mayor que 0."
    : Math.abs(rateValue - lastRate) / lastRate > 0.3
      ? `La tasa se aleja más de un 30 % de la tasa de referencia (${lastRate}). Revísala antes de crear el pedido.`
      : "";
  const customerId = selectedCustomer?.id ?? 0;
  const availableRecentCustomers = recentCustomers.filter(
    (entry) =>
      entry.organizationId === organizationId &&
      entry.branchId === organization?.branchId,
  );
  const availableRevisions = revisionRows.filter(
    (entry) => entry.customerId === customerId,
  );
  const availableItems = items.filter(
    (item) =>
      item.organizationId === null || item.organizationId === organizationId,
  );
  const groupedItems = Object.entries(
    availableItems.reduce<Record<string, SaleItem[]>>((groups, item) => {
      (groups[item.category] ??= []).push(item);
      return groups;
    }, {}),
  );
  const selectedItems = availableItems.filter((item) => selected.includes(item.id));
  // Client-side running total (agreed prices); the server confirms it on save and may
  // add graduation surcharges, so the UI labels it as an estimate.
  const estimate = selectedItems.reduce<Record<string, number>>((totals, item) => {
    const agreed = Number(agreedPrices[item.id]?.trim() || item.price);
    totals[item.currency] = (totals[item.currency] ?? 0) + (Number.isFinite(agreed) ? agreed : item.price);
    return totals;
  }, {});
  const numericRateValue = Number(rate) || 0;
  const estimateCup = Object.entries(estimate).reduce(
    (sum, [currency, total]) => sum + (currency === "USD" ? total * numericRateValue : total),
    0,
  );

  function selectCustomer(customer: SaleCustomer) {
    setSelectedCustomer(customer);
    setRevisionId(0);
    resetQuote();
    void supabase
      .from("prescription_revisions")
      .select("id, organization_id, branch_id, prescription_id, prescription_date, prescriptions!inner(customer_id)")
      .eq("prescriptions.customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as { id: number; organization_id: number; branch_id: number; prescription_id: number; prescription_date: string }[];
        setRevisionRows((current) => [
          ...current.filter((entry) => entry.customerId !== customer.id),
          ...rows.map((row) => ({ id: row.id, organizationId: row.organization_id, branchId: row.branch_id, customerId: customer.id, label: `Receta #${row.prescription_id} · ${row.prescription_date}` })),
        ]);
      });
  }

  // Offer the unfinished sale once (a deep link to a customer starts a new one).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!initialCustomer) setRestorable(readDraft(draftKey));
    }, 0);
    return () => window.clearTimeout(timer);
    // Only on mount and when the branch changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (!selectedCustomer || restorable || acceptedOrder) return;
    const timer = window.setTimeout(() => writeDraft(draftKey, {
      savedAt: Date.now(), customer: selectedCustomer, revisionId, selected, agreedPrices, adjustmentReasons, rate, notes,
    }), 500);
    return () => window.clearTimeout(timer);
  }, [acceptedOrder, adjustmentReasons, agreedPrices, draftKey, notes, rate, restorable, revisionId, selected, selectedCustomer]);

  function restoreDraft(draft: SaleDraft) {
    const availableIds = new Set(availableItems.map((item) => item.id));
    selectCustomer(draft.customer);
    setRevisionId(draft.revisionId);
    setSelected(draft.selected.filter((id) => availableIds.has(id)));
    setAgreedPrices(draft.agreedPrices);
    setAdjustmentReasons(draft.adjustmentReasons);
    setRate(draft.rate);
    setNotes(draft.notes);
    setRestorable(null);
  }
  function discardDraft() {
    writeDraft(draftKey, null);
    setRestorable(null);
  }

  function resetQuote() {
    quoteRequestId.current = null;
    setQuotationId(null);
    setPreview(null);
  }
  function updateAgreedPrice(itemId: number, value: string) {
    setAgreedPrices((current) => ({ ...current, [itemId]: value }));
    resetQuote();
  }
  function updateAdjustmentReason(itemId: number, value: string) {
    setAdjustmentReasons((current) => ({ ...current, [itemId]: value }));
    resetQuote();
  }
  function toggle(itemId: number) {
    // A pair of glasses has one vision type: picking another replaces the previous one.
    const category = availableItems.find((item) => item.id === itemId)?.category;
    const exclusiveIds = category === "vision_type"
      ? new Set(availableItems.filter((item) => item.category === category).map((item) => item.id))
      : null;
    setSelected((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current.filter((id) => !exclusiveIds?.has(id)), itemId],
    );
    resetQuote();
  }
  function changeScope(value: string) {
    setScopeKey(value);
    setRate(String(referenceRate(Number(value.split(":")[0]))));
    setSelectedCustomer(null);
    setRevisionId(0);
    setSelected([]);
    setAgreedPrices({});
    setAdjustmentReasons({});
    setMessage("");
    resetQuote();
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization?.canOperate)
      return setDialogMessage(
        "Esta organización está en modo de solo lectura.",
      );
    const form = new FormData(event.currentTarget);
    const values = customerFormValues(form, newCustomerName, newCustomerPhones);
    const name = values.fullName;
    if (name.length < 2 || values.phones.length !== newCustomerPhones.length)
      return setDialogMessage(
        "Completa el nombre y un teléfono de al menos cinco dígitos.",
      );
    setSavingQuick(true);
    setDialogMessage("");
    // QA-19: warn about a same-name or same-phone customer once; creating anyway is allowed.
    if (duplicates === null) {
      const matches = await findDuplicateCustomers(supabase, { organizationId: organization.id, branchId: organization.branchId }, name, values.phones.map(({ number }) => number));
      if (matches.length) {
        setDuplicates(matches);
        setDialogMessage("Ya hay clientes parecidos. Usa uno de ellos o, si es otra persona, pulsa «Crear y seleccionar» de nuevo.");
        setSavingQuick(false);
        return;
      }
    }
    customerRequestId.current ??= newRequestId();
    const { data, error } = await supabase.rpc("create_customer_with_phones", {
      target_organization_id: organization.id,
      target_branch_id: organization.branchId,
      customer_full_name: name,
      customer_request_id: customerRequestId.current,
      customer_national_id: values.nationalId,
      customer_address: values.address,
      customer_birth_date: values.birthDate,
      customer_notes: values.notes,
      customer_messaging_consent: values.messagingConsent,
      phone_entries: values.phones,
    } as never);
    if (error) {
      if (!isNetworkError(error)) customerRequestId.current = null;
      setDialogMessage(friendlyError(error, "No se pudo registrar el cliente."));
      setSavingQuick(false);
      return;
    }
    customerRequestId.current = null;
    setSelectedCustomer({
      id: Number(data),
      organizationId: organization.id,
      branchId: organization.branchId,
      name,
    });
    setRevisionId(0);
    setNewCustomerName("");
    setNewCustomerPhones([{ number: "", label: "Principal", whatsappEnabled: true }]);
    setDuplicates(null);
    setDialog(null);
    setMessage(`${name} quedó seleccionado para esta venta.`);
    setSavingQuick(false);
  }

  async function createPrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization?.canOperate || !selectedCustomer)
      return setDialogMessage("Selecciona primero el cliente de la receta.");
    const form = new FormData(event.currentTarget);
    const validationError = validatePrescriptionForm(form);
    if (validationError) return setDialogMessage(validationError);
    const attachment = form.get("attachment");
    const attachmentError = prescriptionAttachmentError(attachment);
    if (attachmentError) return setDialogMessage(attachmentError);
    setSavingQuick(true);
    setDialogMessage("");
    const { data, error } = await supabase.rpc("create_prescription_revision", {
      target_organization_id: organization.id,
      target_branch_id: organization.branchId,
      target_customer_id: selectedCustomer.id,
      target_prescription_id: null,
      ...prescriptionRevisionValues(form),
      revision_change_reason: "",
    } as never);
    if (error) {
      setDialogMessage(friendlyPrescriptionError(error.message));
      setSavingQuick(false);
      return;
    }
    const result = data as unknown as PrescriptionResult;
    const attachmentFailed =
      attachment instanceof File && attachment.size > 0 &&
      !(await uploadPrescriptionOriginal(supabase, { organizationId: organization.id, branchId: organization.branchId, prescriptionId: result.prescriptionId, revisionId: result.revisionId }, attachment));
    const date = String(form.get("prescriptionDate"));
    const created: Revision = {
      id: result.revisionId,
      organizationId: organization.id,
      branchId: organization.branchId,
      customerId: selectedCustomer.id,
      label: `Receta #${result.prescriptionId} · ${date}`,
    };
    setRevisionRows((current) => [created, ...current]);
    setRevisionId(created.id);
    setDialog(null);
    setMessage(
      attachmentFailed
        ? "La receta quedó asociada, pero el original no pudo almacenarse. Puedes adjuntarlo desde Recetas."
        : "La receta nueva quedó asociada a esta venta.",
    );
    resetQuote();
    setSavingQuick(false);
  }

  // Validates agreed prices; returns the adjustments or a Spanish error message.
  function lineAdjustmentsOrError(): Record<string, { amount: number; reason: string }> | string {
    if (!organization || !customerId || !selected.length)
      return "Selecciona cliente y al menos un concepto.";
    if (!Number.isFinite(rateValue) || rateValue <= 0)
      return "Indica una tasa de cambio mayor que 0.";
    const lineAdjustments: Record<string, { amount: number; reason: string }> = {};
    for (const item of selectedItems) {
      const rawAmount = agreedPrices[item.id]?.trim();
      if (!rawAmount) continue;
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount < 0)
        return `Indica un precio válido para ${item.name}.`;
      if (amount === item.price) continue;
      const reason = adjustmentReasons[item.id]?.trim() ?? "";
      if (reason.length < 5)
        return `Explica el ajuste de ${item.name} en al menos 5 caracteres.`;
      if (amount < item.price * 0.9 && !organization.canApproveLargeDiscount)
        return `El descuento de ${item.name} supera el 10 %. Debe autorizarlo un propietario.`;
      lineAdjustments[String(item.id)] = { amount, reason };
    }
    return lineAdjustments;
  }

  // One round trip: save_sale_quotation saves and returns the pricing. Returns the
  // quotation id, or null after reporting the error.
  async function persistQuote(lineAdjustments: Record<string, { amount: number; reason: string }>) {
    if (!organization) return null;
    quoteRequestId.current ??= newRequestId();
    const { data, error } = await supabase.rpc("save_sale_quotation", {
      target_quotation_id: quotationId,
      target_organization_id: organizationId,
      target_branch_id: organization.branchId,
      target_customer_id: customerId,
      target_prescription_revision_id: revisionId || null,
      selected_item_ids: selected,
      target_usd_to_cup_rate: rate ? Number(rate) : null,
      target_notes: notes,
      target_line_adjustments: lineAdjustments,
      quotation_request_id: quoteRequestId.current,
    } as never);
    if (error) {
      setMessage(friendlyError(error, "No pudimos guardar la cotización."));
      return null;
    }
    const result = data as unknown as { quotationId: number; pricing: PriceResult };
    setPreview(result.pricing);
    setQuotationId(result.quotationId);
    return result.quotationId;
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const adjustments = lineAdjustmentsOrError();
    if (typeof adjustments === "string") return setMessage(adjustments);
    startTransition(async () => {
      setMessage("");
      if (await persistQuote(adjustments))
        setMessage("Cotización guardada. Confirma los importes con el cliente.");
    });
  }

  // "Cliente acepta" works in one tap: it saves the quotation first when needed.
  function accept() {
    const adjustments = quotationId ? {} : lineAdjustmentsOrError();
    if (typeof adjustments === "string") return setMessage(adjustments);
    startTransition(async () => {
      setMessage("");
      const targetQuotationId = quotationId ?? (await persistQuote(adjustments));
      if (!targetQuotationId) return;
      // accept_quotation is idempotent, so a dropped response is retried once.
      const acceptOnce = () =>
        supabase.rpc("accept_quotation", {
          target_quotation_id: targetQuotationId,
        } as never);
      let { data, error } = await acceptOnce();
      if (error && isNetworkError(error)) ({ data, error } = await acceptOnce());
      if (error)
        return setMessage(
          isNetworkError(error)
            ? "Sin conexión: no pudimos confirmar el pedido. Pulsa “Cliente acepta” otra vez cuando vuelva la señal; no se creará un pedido duplicado."
            : friendlyError(error, "No pudimos confirmar el pedido."),
        );
      const result = data as unknown as AcceptedOrder;
      setMessage(
        `Pedido ${result.orderNumber} creado con precios y tasa inmutables.`,
      );
      setAcceptedOrder(result);
      void refreshNavigationCounters();
      setQuotationId(null);
      writeDraft(draftKey, null);
    });
  }

  if (!organizations.length)
    return <EmptyState icon={Store} title="Sin sucursal comercial" description="No tienes una sucursal comercial disponible." />;
  if (acceptedOrder && selectedCustomer)
    return (
      <AcceptedOrderPanel
        order={acceptedOrder}
        customerName={selectedCustomer.name}
        preview={preview}
        onNewSale={() => {
          setAcceptedOrder(null);
          setSelectedCustomer(null);
          setRevisionId(0);
          setSelected([]);
          setAgreedPrices({});
          setAdjustmentReasons({});
          setPreview(null);
          setNotes("");
          setMessage("");
          writeDraft(draftKey, null);
        }}
      />
    );

  const currentStep = !customerId ? 0 : !selected.length ? 1 : !quotationId ? 2 : 3;
  return (
    <>
      <form ref={formRef} onSubmit={save} noValidate className="grid items-start gap-5 pb-24 xl:grid-cols-[minmax(0,1fr)_390px] xl:pb-0">
        <div className="flex min-w-0 flex-col gap-5">
          {restorable ? (
            <Alert tone="info" title="Tienes una venta sin terminar">
              {restorable.customer.name} · {restorable.selected.length === 1 ? "1 concepto" : `${restorable.selected.length} conceptos`}
              <span className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => restoreDraft(restorable)}>Recuperar</Button>
                <Button size="sm" variant="ghost" onClick={discardDraft}>Descartar</Button>
              </span>
            </Alert>
          ) : null}
          <Card className="flex flex-col gap-4">
            <Steps label="Progreso de la venta" steps={["Cliente", "Configuración", "Cotización", "Pedido"]} current={currentStep} />
            <h2 className="font-display text-[17px] font-semibold text-ink">Cliente y receta</h2>
            {organizations.length > 1 ? (
              <Field label="Organización y sucursal">
                <FormSelect
                  ariaLabel="Organización y sucursal"
                  value={scopeKey}
                  onValueChange={changeScope}
                  options={organizations.map((entry) => ({ value: `${entry.id}:${entry.branchId}`, label: `${entry.name} · ${entry.branchName}` }))}
                />
              </Field>
            ) : null}
            <QuickPicker label="Cliente" actionLabel="Nuevo cliente" onAction={() => { setDialogMessage(""); setDialog("customer"); }}>
              <CustomerSearchPicker
                organizationId={organizationId}
                branchId={organization?.branchId ?? 0}
                recent={availableRecentCustomers}
                selected={selectedCustomer}
                onSelect={selectCustomer}
                onClear={() => { setSelectedCustomer(null); setRevisionId(0); resetQuote(); }}
              />
            </QuickPicker>
            <QuickPicker label="Receta" actionLabel="Nueva receta" disabled={!customerId} onAction={() => { setDialogMessage(""); setDialog("prescription"); }}>
              <FormSelect
                ariaLabel="Receta asociada"
                value={String(revisionId)}
                onValueChange={(value) => { setRevisionId(Number(value)); resetQuote(); }}
                options={[{ value: "0", label: "Sin receta asociada" }, ...availableRevisions.map((entry) => ({ value: String(entry.id), label: entry.label }))]}
              />
            </QuickPicker>
            <div className="flex flex-col gap-3 rounded-control border border-line bg-canvas p-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Tasa de esta venta</p>
                <p className="text-[13px] leading-5 text-text-muted">Se usa para convertir importes en USD y queda congelada al crear el pedido.</p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-text-secondary">
                <span>1 USD =</span>
                <span className="w-28">
                  <Input
                    aria-label="Tasa de cambio de USD a CUP"
                    value={rate}
                    onChange={(event) => { setRate(event.target.value); resetQuote(); }}
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    numeric
                    onBlur={() => {
                      const numericRate = Number(rate);
                      if (Number.isFinite(numericRate)) setRate(String(Math.round(numericRate * 100) / 100));
                    }}
                    required
                  />
                </span>
                <span>CUP</span>
              </label>
            </div>
            {organization?.canOperate ? (
              <ExchangeRateRefresh
                organizationId={organizationId}
                current={adoptedRates[organizationId] ?? null}
                onRefreshed={(next) => { setAdoptedRates((current) => ({ ...current, [organizationId]: next })); setRate(String(next.rate)); resetQuote(); }}
              />
            ) : null}
            {rateWarning ? <Alert tone="warning">{rateWarning}</Alert> : null}
          </Card>

          <Card className="flex flex-col gap-5">
            <div>
              <h2 className="font-display text-[17px] font-semibold text-ink">Configuración</h2>
              <p className="mt-1 text-sm text-text-muted">Toca cada opción que formará parte de la cotización.</p>
            </div>
            <ItemPicker
              groupedItems={groupedItems}
              selected={selected}
              agreedPrices={agreedPrices}
              adjustmentReasons={adjustmentReasons}
              onToggle={toggle}
              onAgreedPriceChange={updateAgreedPrice}
              onAdjustmentReasonChange={updateAdjustmentReason}
            />
            <Field label="Notas comerciales" optional>
              <Textarea name="notes" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </Card>
        </div>

        <QuoteSummary preview={preview} estimate={estimate} estimateCup={estimateCup} selectedCount={selected.length} quotationId={quotationId} pending={pending} canOperate={Boolean(organization?.canOperate)} canAccept={Boolean(customerId && selected.length)} message={message} onAccept={accept} />
      </form>

      {/* Below xl the summary sits after the catalog: keep total and the main action in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line-soft bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] shadow-[0_-6px_18px_rgba(7,50,47,0.08)] xl:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-text-muted">{preview ? "Total" : "Total estimado"} · {selected.length === 1 ? "1 concepto" : `${selected.length} conceptos`}</p>
          <p className="truncate font-display text-lg font-bold tabular-nums text-ink">{summaryTotalLabel(preview, estimate)}</p>
        </div>
        <Button variant="ink" icon={CircleCheck} onClick={accept} disabled={pending || !organization?.canOperate || !customerId || !selected.length} className="shrink-0">{pending ? "Procesando…" : "Cliente acepta"}</Button>
      </div>

      <Dialog
        open={dialog === "customer"}
        onClose={() => setDialog(null)}
        eyebrow={`${organization?.name} · ${organization?.branchName}`}
        title="Nuevo cliente"
        size="lg"
        footer={<>
          <Button variant="ghost" onClick={() => setDialog(null)}>Cancelar</Button>
          <Button type="submit" form="sales-new-customer" formNoValidate icon={UserPlus} disabled={savingQuick}>{savingQuick ? "Guardando…" : "Crear y seleccionar"}</Button>
        </>}
      >
        <form id="sales-new-customer" onSubmit={createCustomer} className="flex flex-col gap-4">
          <CustomerFormFields fullName={newCustomerName} onFullNameChange={(value) => { setNewCustomerName(value); setDuplicates(null); }} phones={newCustomerPhones} onPhonesChange={(value) => { setNewCustomerPhones(value); setDuplicates(null); }} />
          {dialogMessage ? <Alert tone={duplicates?.length ? "warning" : "danger"} role="alert">{dialogMessage}</Alert> : null}
          {duplicates?.length ? (
            <ul className="flex flex-col divide-y divide-line-soft rounded-control border border-line">
              {duplicates.map((match) => (
                <li key={match.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                  <span className="min-w-0 text-sm"><strong className="text-ink">{match.name}</strong><span className="block text-text-muted">{match.phones.join(" · ") || "Sin teléfono"}</span></span>
                  <Button size="sm" variant="secondary" onClick={() => { selectCustomer(match); setDuplicates(null); setDialog(null); setMessage(`${match.name} quedó seleccionado para esta venta.`); }}>Usar este cliente</Button>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      </Dialog>

      <Dialog
        open={dialog === "prescription"}
        onClose={() => setDialog(null)}
        eyebrow={selectedCustomer?.name ?? "Cliente"}
        title="Nueva receta"
        size="lg"
        footer={<>
          <Button variant="ghost" onClick={() => setDialog(null)}>Cancelar</Button>
          <Button type="submit" form="sales-new-prescription" formNoValidate icon={Save} disabled={savingQuick}>{savingQuick ? "Guardando…" : "Guardar y asociar"}</Button>
        </>}
      >
        <form id="sales-new-prescription" onSubmit={createPrescription} className="flex flex-col gap-4" noValidate>
          <PrescriptionFormFields organizationId={selectedCustomer?.organizationId} />
          {dialogMessage ? <Alert tone="danger" role="alert">{dialogMessage}</Alert> : null}
        </form>
      </Dialog>
    </>
  );
}

function QuickPicker({ label, actionLabel, onAction, disabled = false, children }: { label: string; actionLabel: string; onAction: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-text-label">{label}</span>
        <Button variant="ghost" size="sm" icon={Plus} disabled={disabled} onClick={onAction} className="-mr-2">{actionLabel}</Button>
      </div>
      {children}
    </div>
  );
}

const totalFormat = new Intl.NumberFormat("es-CU", { maximumFractionDigits: 2 });

function summaryTotalLabel(preview: PriceResult | null, estimate: Record<string, number>) {
  const totals = Object.entries(preview?.totals ?? estimate);
  return totals.length ? totals.map(([currency, total]) => `${totalFormat.format(total)} ${currency}`).join(" + ") : "—";
}
