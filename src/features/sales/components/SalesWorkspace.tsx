"use client";

import { CircleCheck, Plus, Store } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { ExchangeRateRefresh, FormSelect, type BusinessRate } from "@/shared/components";
import { friendlyError, isNetworkError } from "@/shared/lib/friendly-error";
import { refreshNavigationCounters } from "@/shared/lib/navigation-counters";
import { newRequestId } from "@/shared/utils/request-id";
import { Alert, Button, Card, EmptyState, Field, Input, Steps, Textarea } from "@/shared/ui";

import { AcceptedOrderPanel } from "./AcceptedOrderPanel";
import { CustomerSearchPicker, type SaleCustomer } from "./CustomerSearchPicker";
import { PairEditor } from "./PairEditor";
import { QuoteSummary } from "./QuoteSummary";
import { NewCustomerDialog, NewPrescriptionDialog, NewRelativeDialog } from "./SaleDialogs";
import { newPair, readDraft, writeDraft, type SaleDraft } from "./sale-draft";
import { pairAdjustmentsOrError, pairEstimate, sumTotals, toCup, toggleItem, type LineAdjustments } from "./sale-pricing";
import { MAX_PAIRS, type AcceptedOrder, type MultiPriceResult, type PairDraft, type Revision, type SaleItem } from "./sale-types";

type Organization = { id: number; name: string; branchId: number; branchName: string; canOperate: boolean; canApproveLargeDiscount: boolean };
type Dialog = { kind: "customer" } | { kind: "relative"; pairIndex: number } | { kind: "prescription"; pairIndex: number } | null;
type SaleLine = { patientCustomerId: number; prescriptionRevisionId: number | null; itemIds: number[]; lineAdjustments: LineAdjustments };

export function SalesWorkspace({ organizations, userId, lastRates, businessRates, recentCustomers, initialCustomer, initialRevisions, items }: {
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
  const initialScope = organizations.find((entry) => initialCustomer && entry.id === initialCustomer.organizationId && entry.branchId === initialCustomer.branchId) ?? organizations[0];
  const [scopeKey, setScopeKey] = useState(initialScope ? `${initialScope.id}:${initialScope.branchId}` : "");
  const [holder, setHolder] = useState<SaleCustomer | null>(initialCustomer);
  const [pairs, setPairs] = useState<PairDraft[]>(() => [newPair()]);
  const [relatives, setRelatives] = useState<SaleCustomer[]>([]);
  const [revisionRows, setRevisionRows] = useState<Revision[]>(initialRevisions);
  // The stored elTOQUE rate wins over the last order rate; 420 only as a last resort.
  const [adoptedRates, setAdoptedRates] = useState(businessRates);
  const referenceRate = (id: number) => adoptedRates[id]?.rate ?? lastRates[id] ?? 420;
  const [rate, setRate] = useState(String(referenceRate(initialScope?.id ?? 0)));
  const [notes, setNotes] = useState("");
  const [restorable, setRestorable] = useState<SaleDraft | null>(null);
  const [quotationId, setQuotationId] = useState<number | null>(null);
  const [preview, setPreview] = useState<MultiPriceResult | null>(null);
  const [acceptedOrder, setAcceptedOrder] = useState<AcceptedOrder | null>(null);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, startTransition] = useTransition();
  // One id per quotation attempt, kept until the quote changes, so a retry after a
  // lost response reuses the quotation instead of creating another one.
  const quoteRequestId = useRef<string | null>(null);

  const organization = organizations.find((entry) => `${entry.id}:${entry.branchId}` === scopeKey);
  const organizationId = organization?.id ?? 0;
  const scope = organization ? { id: organization.id, name: organization.name, branchId: organization.branchId, branchName: organization.branchName, canOperate: organization.canOperate } : undefined;
  const draftKey = `lensspace:sale-draft:${userId}:${scopeKey}`;
  const lastRate = referenceRate(organizationId);
  const rateValue = Number(rate);
  const rateWarning = !rate || !Number.isFinite(rateValue) || rateValue <= 0
    ? "Indica una tasa mayor que 0."
    : Math.abs(rateValue - lastRate) / lastRate > 0.3 ? `La tasa se aleja más de un 30 % de la tasa de referencia (${lastRate}). Revísala antes de crear el pedido.` : "";
  const availableRecentCustomers = recentCustomers.filter((entry) => entry.organizationId === organizationId && entry.branchId === organization?.branchId);
  const availableItems = items.filter((item) => item.organizationId === null || item.organizationId === organizationId);
  const groupedItems = Object.entries(availableItems.reduce<Record<string, SaleItem[]>>((groups, item) => {
    (groups[item.category] ??= []).push(item);
    return groups;
  }, {}));
  const patientOf = (pair: PairDraft) => pair.patient ?? holder;
  const pairLabels = pairs.map((pair, index) => `Par ${index + 1}${patientOf(pair) ? ` · ${patientOf(pair)?.name}` : ""}`);
  const pairEstimates = pairs.map((pair) => pairEstimate(pair, availableItems));
  const estimate = sumTotals(pairEstimates);
  const estimateCup = toCup(estimate, Number(rate) || 0);
  const selectedCount = pairs.reduce((sum, pair) => sum + pair.selected.length, 0);
  const ready = Boolean(holder && pairs.every((pair) => pair.selected.length));

  function loadRevisions(customer: SaleCustomer) {
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

  function resetQuote() {
    quoteRequestId.current = null;
    setQuotationId(null);
    setPreview(null);
  }
  function updatePair(index: number, update: (pair: PairDraft) => PairDraft) {
    setPairs((current) => current.map((pair, position) => (position === index ? update(pair) : pair)));
    resetQuote();
  }
  function selectHolder(customer: SaleCustomer | null) {
    setHolder(customer);
    // Pairs worn by the holder lose a prescription that belonged to the previous holder.
    setPairs((current) => current.map((pair) => (pair.patient ? pair : { ...pair, revisionId: 0 })));
    if (customer) loadRevisions(customer);
    resetQuote();
  }
  function setPatient(index: number, patient: SaleCustomer | null) {
    updatePair(index, (pair) => ({ ...pair, patient, revisionId: 0 }));
    if (patient) {
      setRelatives((current) => [patient, ...current.filter((entry) => entry.id !== patient.id)]);
      loadRevisions(patient);
    }
  }
  function addPair() {
    setPairs((current) => (current.length >= MAX_PAIRS ? current : [...current, newPair()]));
    resetQuote();
  }
  function removePair(index: number) {
    setPairs((current) => (current.length > 1 ? current.filter((_, position) => position !== index) : current));
    resetQuote();
  }
  function startNewSale() {
    setHolder(null);
    setPairs([newPair()]);
    setRelatives([]);
    setNotes("");
    setMessage("");
    resetQuote();
  }
  function changeScope(value: string) {
    setScopeKey(value);
    setRate(String(referenceRate(Number(value.split(":")[0]))));
    startNewSale();
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
    if (!holder || restorable || acceptedOrder) return;
    const timer = window.setTimeout(() => writeDraft(draftKey, { version: 2, savedAt: Date.now(), customer: holder, pairs, rate, notes }), 500);
    return () => window.clearTimeout(timer);
  }, [acceptedOrder, draftKey, holder, notes, pairs, rate, restorable]);

  function restoreDraft(draft: SaleDraft) {
    const availableIds = new Set(availableItems.map((item) => item.id));
    selectHolder(draft.customer);
    setPairs(draft.pairs.map((pair) => ({ ...pair, selected: pair.selected.filter((id) => availableIds.has(id)) })));
    const patients = draft.pairs.flatMap((pair) => (pair.patient ? [pair.patient] : []));
    setRelatives(patients);
    patients.forEach(loadRevisions);
    setRate(draft.rate);
    setNotes(draft.notes);
    setRestorable(null);
  }
  function discardDraft() {
    writeDraft(draftKey, null);
    setRestorable(null);
  }

  // Validates every pair; returns the RPC lines or a Spanish error message.
  function saleLinesOrError(): SaleLine[] | string {
    if (!organization || !holder) return "Selecciona el cliente de la venta.";
    if (!Number.isFinite(rateValue) || rateValue <= 0) return "Indica una tasa de cambio mayor que 0.";
    const lines: SaleLine[] = [];
    for (const [index, pair] of pairs.entries()) {
      const label = pairs.length > 1 ? `el par ${index + 1}` : "la venta";
      const adjustments = pairAdjustmentsOrError(pair, availableItems, organization.canApproveLargeDiscount, label);
      if (typeof adjustments === "string") return adjustments;
      lines.push({ patientCustomerId: (pair.patient ?? holder).id, prescriptionRevisionId: pair.revisionId || null, itemIds: pair.selected, lineAdjustments: adjustments });
    }
    return lines;
  }

  // One round trip: save_multi_line_quotation saves and returns the pricing. Returns the
  // quotation id, or null after reporting the error.
  async function persistQuote(lines: SaleLine[]) {
    if (!organization || !holder) return null;
    quoteRequestId.current ??= newRequestId();
    const { data, error } = await supabase.rpc("save_multi_line_quotation", {
      target_quotation_id: quotationId,
      target_organization_id: organizationId,
      target_branch_id: organization.branchId,
      target_customer_id: holder.id,
      target_lines: lines,
      target_usd_to_cup_rate: rate ? Number(rate) : null,
      target_notes: notes,
      quotation_request_id: quoteRequestId.current,
    } as never);
    if (error) {
      setMessage(friendlyError(error, "No pudimos guardar la cotización."));
      return null;
    }
    const result = data as unknown as { quotationId: number; pricing: MultiPriceResult };
    setPreview(result.pricing);
    setQuotationId(result.quotationId);
    return result.quotationId;
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lines = saleLinesOrError();
    if (typeof lines === "string") return setMessage(lines);
    startTransition(async () => {
      setMessage("");
      if (await persistQuote(lines)) setMessage("Cotización guardada. Confirma los importes con el cliente.");
    });
  }

  // "Cliente acepta" works in one tap: it saves the quotation first when needed.
  function accept() {
    const lines = quotationId ? [] : saleLinesOrError();
    if (typeof lines === "string") return setMessage(lines);
    startTransition(async () => {
      setMessage("");
      const targetQuotationId = quotationId ?? (await persistQuote(lines));
      if (!targetQuotationId) return;
      // accept_quotation is idempotent, so a dropped response is retried once.
      const acceptOnce = () => supabase.rpc("accept_quotation", { target_quotation_id: targetQuotationId } as never);
      let { data, error } = await acceptOnce();
      if (error && isNetworkError(error)) ({ data, error } = await acceptOnce());
      if (error)
        return setMessage(isNetworkError(error)
          ? "Sin conexión: no pudimos confirmar el pedido. Pulsa “Cliente acepta” otra vez cuando vuelva la señal; no se creará un pedido duplicado."
          : friendlyError(error, "No pudimos confirmar el pedido."));
      const result = data as unknown as AcceptedOrder;
      setMessage(`Pedido ${result.orderNumber} creado con precios y tasa inmutables.`);
      setAcceptedOrder(result);
      void refreshNavigationCounters();
      setQuotationId(null);
      writeDraft(draftKey, null);
    });
  }

  if (!organizations.length) return <EmptyState icon={Store} title="Sin sucursal comercial" description="No tienes una sucursal comercial disponible." />;
  if (acceptedOrder && holder)
    return <AcceptedOrderPanel order={acceptedOrder} customerName={holder.name} preview={preview} pairLabels={pairLabels} onNewSale={() => { setAcceptedOrder(null); startNewSale(); writeDraft(draftKey, null); }} />;

  const dialogPair = dialog && dialog.kind !== "customer" ? pairs[dialog.pairIndex] : undefined;
  const currentStep = !holder ? 0 : !selectedCount ? 1 : !quotationId ? 2 : 3;
  return (
    <>
      <form onSubmit={save} noValidate className="grid items-start gap-5 pb-24 xl:grid-cols-[minmax(0,1fr)_390px] xl:pb-0">
        <div className="flex min-w-0 flex-col gap-5">
          {restorable ? (
            <Alert tone="info" title="Tienes una venta sin terminar">
              {restorable.customer.name} · {restorable.pairs.length > 1 ? `${restorable.pairs.length} pares` : `${restorable.pairs[0]?.selected.length ?? 0} conceptos`}
              <span className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => restoreDraft(restorable)}>Recuperar</Button>
                <Button size="sm" variant="ghost" onClick={discardDraft}>Descartar</Button>
              </span>
            </Alert>
          ) : null}
          <Card className="flex flex-col gap-4">
            <Steps label="Progreso de la venta" steps={["Cliente", "Configuración", "Cotización", "Pedido"]} current={currentStep} />
            <h2 className="font-display text-[17px] font-semibold text-ink">Cliente</h2>
            {organizations.length > 1 ? (
              <Field label="Organización y sucursal">
                <FormSelect ariaLabel="Organización y sucursal" value={scopeKey} onValueChange={changeScope} options={organizations.map((entry) => ({ value: `${entry.id}:${entry.branchId}`, label: `${entry.name} · ${entry.branchName}` }))} />
              </Field>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold text-text-label">Quien encarga y paga</span>
                <Button variant="ghost" size="sm" icon={Plus} onClick={() => setDialog({ kind: "customer" })} className="-mr-2">Nuevo cliente</Button>
              </div>
              <CustomerSearchPicker organizationId={organizationId} branchId={organization?.branchId ?? 0} recent={availableRecentCustomers} selected={holder} onSelect={selectHolder} onClear={() => selectHolder(null)} />
            </div>
            <div className="flex flex-col gap-3 rounded-control border border-line bg-canvas p-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Tasa de esta venta</p>
                <p className="text-[13px] leading-5 text-text-muted">Se usa para convertir importes en USD y queda congelada al crear el pedido.</p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-text-secondary">
                <span>1 USD =</span>
                <span className="w-28">
                  <Input aria-label="Tasa de cambio de USD a CUP" value={rate} onChange={(event) => { setRate(event.target.value); resetQuote(); }} type="number" inputMode="decimal" min="0.01" step="0.01" numeric required
                    onBlur={() => { const numericRate = Number(rate); if (Number.isFinite(numericRate)) setRate(String(Math.round(numericRate * 100) / 100)); }} />
                </span>
                <span>CUP</span>
              </label>
            </div>
            {organization?.canOperate ? (
              <ExchangeRateRefresh organizationId={organizationId} current={adoptedRates[organizationId] ?? null}
                onRefreshed={(next) => { setAdoptedRates((current) => ({ ...current, [organizationId]: next })); setRate(String(next.rate)); resetQuote(); }} />
            ) : null}
            {rateWarning ? <Alert tone="warning">{rateWarning}</Alert> : null}
          </Card>

          {pairs.map((pair, index) => {
            const patient = patientOf(pair);
            return (
              <PairEditor key={pair.key} index={index} pairCount={pairs.length} pair={pair} holder={holder}
                scope={{ organizationId, branchId: organization?.branchId ?? 0 }}
                relatives={[...relatives, ...availableRecentCustomers.filter((entry) => !relatives.some((relative) => relative.id === entry.id))].filter((entry) => entry.id !== holder?.id)}
                revisions={patient ? revisionRows.filter((entry) => entry.customerId === patient.id) : []}
                groupedItems={groupedItems}
                onPatientChange={(next) => setPatient(index, next)}
                onRevisionChange={(revisionId) => updatePair(index, (current) => ({ ...current, revisionId }))}
                onToggle={(itemId) => updatePair(index, (current) => ({ ...current, selected: toggleItem(current.selected, itemId, availableItems) }))}
                onAgreedPriceChange={(itemId, value) => updatePair(index, (current) => ({ ...current, agreedPrices: { ...current.agreedPrices, [itemId]: value } }))}
                onAdjustmentReasonChange={(itemId, value) => updatePair(index, (current) => ({ ...current, adjustmentReasons: { ...current.adjustmentReasons, [itemId]: value } }))}
                onNewRelative={() => setDialog({ kind: "relative", pairIndex: index })}
                onNewPrescription={() => setDialog({ kind: "prescription", pairIndex: index })}
                onRemove={() => removePair(index)} />
            );
          })}

          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">¿Espejuelos para otra persona?</p>
                <p className="text-[13px] text-text-muted">Cada par lleva su receta y sus conceptos; se cobra y se entrega todo junto.</p>
              </div>
              <Button variant="secondary" icon={Plus} disabled={!holder || pairs.length >= MAX_PAIRS} onClick={addPair}>Agregar par</Button>
            </div>
            <Field label="Notas comerciales" optional>
              <Textarea name="notes" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </Card>
        </div>

        <QuoteSummary preview={preview} pairLabels={pairLabels} pairEstimates={pairEstimates} estimate={estimate} estimateCup={estimateCup} selectedCount={selectedCount}
          quotationId={quotationId} pending={pending} canOperate={Boolean(organization?.canOperate)} canAccept={ready} message={message} onAccept={accept} />
      </form>

      {/* Below xl the summary sits after the catalog: keep total and the main action in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line-soft bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] shadow-[0_-6px_18px_rgba(7,50,47,0.08)] xl:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-text-muted">{preview ? "Total" : "Total estimado"} · {pairs.length > 1 ? `${pairs.length} pares` : selectedCount === 1 ? "1 concepto" : `${selectedCount} conceptos`}</p>
          <p className="truncate font-display text-lg font-bold tabular-nums text-ink">{summaryTotalLabel(preview?.totals ?? estimate)}</p>
        </div>
        <Button variant="ink" icon={CircleCheck} onClick={accept} disabled={pending || !organization?.canOperate || !ready} className="shrink-0">{pending ? "Procesando…" : "Cliente acepta"}</Button>
      </div>

      <NewCustomerDialog open={dialog?.kind === "customer"} scope={scope} onClose={() => setDialog(null)}
        onCreated={(customer) => { selectHolder(customer); setDialog(null); setMessage(`${customer.name} quedó seleccionado para esta venta.`); }} />
      <NewRelativeDialog open={dialog?.kind === "relative"} scope={scope} holder={holder} onClose={() => setDialog(null)}
        onCreated={(customer) => { if (dialog?.kind === "relative") setPatient(dialog.pairIndex, customer); setDialog(null); setMessage(`${customer.name} quedó registrado como familiar.`); }} />
      <NewPrescriptionDialog open={dialog?.kind === "prescription"} scope={scope} patient={dialogPair ? patientOf(dialogPair) : null} onClose={() => setDialog(null)}
        onCreated={(revision, note) => {
          setRevisionRows((current) => [revision, ...current]);
          if (dialog?.kind === "prescription") updatePair(dialog.pairIndex, (current) => ({ ...current, revisionId: revision.id }));
          setDialog(null);
          setMessage(note);
        }} />
    </>
  );
}

const totalFormat = new Intl.NumberFormat("es-CU", { maximumFractionDigits: 2 });

function summaryTotalLabel(totals: Record<string, number>) {
  const entries = Object.entries(totals);
  return entries.length ? entries.map(([currency, total]) => `${totalFormat.format(total)} ${currency}`).join(" + ") : "—";
}
