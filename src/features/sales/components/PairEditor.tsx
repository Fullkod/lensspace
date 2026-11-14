"use client";

import { Plus, Trash2, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";

import { FormSelect } from "@/shared/components";
import { Button, Card } from "@/shared/ui";

import { CustomerSearchPicker, type SaleCustomer } from "./CustomerSearchPicker";
import { ItemPicker } from "./ItemPicker";
import type { PairDraft, Revision, SaleItem } from "./sale-types";

type PairEditorProps = {
  index: number;
  pairCount: number;
  pair: PairDraft;
  holder: SaleCustomer | null;
  scope: { organizationId: number; branchId: number };
  relatives: SaleCustomer[];
  revisions: Revision[];
  groupedItems: [string, SaleItem[]][];
  onPatientChange: (patient: SaleCustomer | null) => void;
  onRevisionChange: (revisionId: number) => void;
  onToggle: (itemId: number) => void;
  onAgreedPriceChange: (itemId: number, value: string) => void;
  onAdjustmentReasonChange: (itemId: number, value: string) => void;
  onNewRelative: () => void;
  onNewPrescription: () => void;
  onRemove: () => void;
  // Offline desk: search the customers saved on the device instead of the server.
  searchCustomers?: (term: string) => SaleCustomer[];
};

// One pair of glasses: who wears them, their prescription and the concepts. With a single
// pair worn by the holder it reads like the classic sale ("Configuración").
export function PairEditor({ index, pairCount, pair, holder, scope, relatives, revisions, groupedItems, onPatientChange, onRevisionChange, onToggle, onAgreedPriceChange, onAdjustmentReasonChange, onNewRelative, onNewPrescription, onRemove, searchCustomers }: PairEditorProps) {
  const [searching, setSearching] = useState(false);
  const patient = pair.patient ?? holder;
  const multi = pairCount > 1;
  const title = multi ? `Par ${index + 1}${patient ? ` · ${patient.name}` : ""}` : "Configuración";

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold text-ink [overflow-wrap:anywhere]">{title}</h2>
          <p className="mt-1 text-sm text-text-muted">Toca cada opción que formará parte de {multi ? "este par" : "la cotización"}.</p>
        </div>
        {multi ? <Button variant="ghost" size="sm" icon={Trash2} onClick={onRemove} className="-mr-2">Quitar par</Button> : null}
      </div>

      <PairRow label="Para quién" actionLabel="Nuevo familiar" actionDisabled={!holder} onAction={onNewRelative}>
        {searching ? (
          <div className="flex flex-col gap-2">
            <CustomerSearchPicker organizationId={scope.organizationId} branchId={scope.branchId} recent={relatives} selected={null} search={searchCustomers}
              onSelect={(customer) => { onPatientChange(customer.id === holder?.id ? null : customer); setSearching(false); }} onClear={() => setSearching(false)} />
            <Button variant="ghost" size="sm" onClick={() => setSearching(false)} className="self-start">Cancelar</Button>
          </div>
        ) : (
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-field px-3.5 py-2">
            <span className="flex min-w-0 items-center gap-2 text-[15px] text-ink">
              <UserRound aria-hidden="true" size={17} className="shrink-0 text-action" />
              <span className="truncate font-semibold">{patient?.name ?? "Elige primero el cliente"}</span>
              {patient && !pair.patient ? <span className="shrink-0 text-[13px] text-text-muted">(titular)</span> : null}
            </span>
            <span className="flex gap-1">
              {pair.patient ? <Button variant="ghost" size="sm" onClick={() => onPatientChange(null)}>Es el titular</Button> : null}
              <Button variant="ghost" size="sm" disabled={!holder} onClick={() => setSearching(true)}>Otra persona</Button>
            </span>
          </div>
        )}
      </PairRow>

      <PairRow label="Receta" actionLabel="Nueva receta" actionDisabled={!patient} onAction={onNewPrescription}>
        <FormSelect
          ariaLabel={multi ? `Receta del par ${index + 1}` : "Receta asociada"}
          value={String(pair.revisionId)}
          onValueChange={(value) => onRevisionChange(Number(value))}
          options={[{ value: "0", label: "Sin receta asociada" }, ...revisions.map((entry) => ({ value: String(entry.id), label: entry.label }))]}
        />
      </PairRow>

      <ItemPicker groupedItems={groupedItems} selected={pair.selected} agreedPrices={pair.agreedPrices} adjustmentReasons={pair.adjustmentReasons}
        onToggle={onToggle} onAgreedPriceChange={onAgreedPriceChange} onAdjustmentReasonChange={onAdjustmentReasonChange} />
    </Card>
  );
}

function PairRow({ label, actionLabel, onAction, actionDisabled, children }: { label: string; actionLabel: string; onAction: () => void; actionDisabled: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-text-label">{label}</span>
        <Button variant="ghost" size="sm" icon={Plus} disabled={actionDisabled} onClick={onAction} className="-mr-2">{actionLabel}</Button>
      </div>
      {children}
    </div>
  );
}
