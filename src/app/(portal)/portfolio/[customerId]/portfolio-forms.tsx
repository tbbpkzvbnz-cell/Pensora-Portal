"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Select, Textarea, btn } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { TRANSFER_ORDER_STATUS_LABELS } from "@/lib/labels";
import { addFoundationAction, saveOrderAction, saveTransactionAction, updateFoundationAction } from "../actions";

type Opt = { id: string; name: string };

/** Toggle wrapper: shows a button, then the form; closes on success. */
export function Toggle({ label, variant = "secondary", children }: { label: string; variant?: keyof typeof btn; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={btn[variant]} onClick={() => setOpen(true)}>{label}</button>;
  return <div className="w-full rounded-lg border border-brand-200 bg-brand-50/40 p-4">{children(() => setOpen(false))}</div>;
}

const closeOn = (close: () => void, fn: (s: ActionState, fd: FormData) => Promise<ActionState>) => async (s: ActionState, fd: FormData) => {
  const r = await fn(s, fd);
  if (r?.success) close();
  return r;
};

export function FoundationForm({ customerId, all, close, edit }: { customerId: string; all: Opt[]; close: () => void; edit?: { pfId: string; foundationId: string; accountOpenedOn: string | null; remark: string | null } }) {
  const [sel, setSel] = useState(edit?.foundationId ?? "");
  return (
    <ActionForm action={closeOn(close, edit ? updateFoundationAction : addFoundationAction)} className="space-y-3">
      {(s) => (
        <>
          <input type="hidden" name="customerId" value={customerId} />
          {edit && <input type="hidden" name="pfId" value={edit.pfId} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Stiftung" required error={s?.fieldErrors?.foundationId}>
              <Select name="foundationId" value={sel} onChange={(e) => setSel(e.target.value)}>
                <option value="">Bitte wählen…</option>
                {all.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                {!edit && <option value="__neu">+ Neue Stiftung erfassen…</option>}
              </Select>
            </Field>
            <Field label="Konto eröffnet am"><Input type="date" name="accountOpenedOn" defaultValue={edit?.accountOpenedOn ?? ""} /></Field>
            {sel === "__neu" && (
              <>
                <Field label="Name der neuen Stiftung" required error={s?.fieldErrors?.name}><Input name="newFoundationName" /></Field>
                <Field label="Adresse"><Input name="newFoundationAddress" /></Field>
              </>
            )}
          </div>
          <Field label="Bemerkung"><Textarea name="remark" rows={2} defaultValue={edit?.remark ?? ""} /></Field>
          <div className="flex justify-end gap-2"><button type="button" className={btn.secondary} onClick={close}>Abbrechen</button><SubmitButton>Speichern</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}

type Order = { id: string; foundationId: string; orderDate: string; status: string; orderAmount: string | null; receivedOn: string | null; receivedAmount: string | null };

export function OrderForm({ customerId, foundations, close, edit }: { customerId: string; foundations: Opt[]; close: () => void; edit?: Order }) {
  return (
    <ActionForm action={closeOn(close, saveOrderAction)} className="space-y-3">
      {(s) => {
        const fe = s?.fieldErrors ?? {};
        return (
          <>
            <input type="hidden" name="customerId" value={customerId} />
            {edit && <input type="hidden" name="orderId" value={edit.id} />}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Stiftung" required error={fe.foundationId}>
                <Select name="foundationId" defaultValue={edit?.foundationId ?? ""}>
                  <option value="">Bitte wählen…</option>
                  {foundations.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </Field>
              <Field label="Datum Überweisungsauftrag" required error={fe.orderDate}><Input type="date" name="orderDate" defaultValue={edit?.orderDate ?? ""} /></Field>
              <Field label="Auftragsstatus" required>
                <Select name="status" defaultValue={edit?.status ?? "erteilt"}>
                  {Object.entries(TRANSFER_ORDER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Betrag Auftrag (CHF)" error={fe.orderAmount}><Input name="orderAmount" inputMode="decimal" defaultValue={edit?.orderAmount ?? ""} /></Field>
              <Field label="Eingangsdatum" error={fe.receivedOn}><Input type="date" name="receivedOn" defaultValue={edit?.receivedOn ?? ""} /></Field>
              <Field label="Tatsächlich eingegangen (CHF)" error={fe.receivedAmount}><Input name="receivedAmount" inputMode="decimal" defaultValue={edit?.receivedAmount ?? ""} /></Field>
            </div>
            <p className="text-xs text-muted">Hinweis: Der Portfolio-Gesamtbetrag wird aus den Transaktionen berechnet. Erfassen Sie den Geldeingang zusätzlich als Transaktion.</p>
            <div className="flex justify-end gap-2"><button type="button" className={btn.secondary} onClick={close}>Abbrechen</button><SubmitButton>Speichern</SubmitButton></div>
          </>
        );
      }}
    </ActionForm>
  );
}

type Tx = { id: string; foundationId: string; kind: string; amount: string; orderDate: string | null; receivedOn: string | null; remark: string | null; transferOrderId: string | null };

export function TransactionForm({ customerId, foundations, orders, close, edit }: { customerId: string; foundations: Opt[]; orders: Opt[]; close: () => void; edit?: Tx }) {
  const [kind, setKind] = useState(edit?.kind ?? "eingang");
  return (
    <ActionForm action={closeOn(close, saveTransactionAction)} className="space-y-3">
      {(s) => {
        const fe = s?.fieldErrors ?? {};
        return (
          <>
            <input type="hidden" name="customerId" value={customerId} />
            {edit && <input type="hidden" name="txId" value={edit.id} />}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Art">
                <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="eingang">Geldeingang</option>
                  <option value="korrektur">Korrektur (+/−)</option>
                </Select>
              </Field>
              <Field label="Stiftung" required error={fe.foundationId}>
                <Select name="foundationId" defaultValue={edit?.foundationId ?? ""}>
                  <option value="">Bitte wählen…</option>
                  {foundations.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </Field>
              <Field label="Überwiesener Betrag (CHF)" required error={fe.amount} hint={kind === "korrektur" ? "Negativ für Abzug, z.B. -500.00" : "z.B. 35000.00"}>
                <Input name="amount" inputMode="decimal" defaultValue={edit?.amount ?? ""} />
              </Field>
              <Field label="Datum Überweisungsauftrag" error={fe.orderDate}><Input type="date" name="orderDate" defaultValue={edit?.orderDate ?? ""} /></Field>
              <Field label="Datum Geldeingang" error={fe.receivedOn} hint="Nur Beträge mit Eingangsdatum zählen als eingegangen."><Input type="date" name="receivedOn" defaultValue={edit?.receivedOn ?? ""} /></Field>
              <Field label="Bezug Überweisungsauftrag">
                <Select name="transferOrderId" defaultValue={edit?.transferOrderId ?? ""}>
                  <option value="">–</option>
                  {orders.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              </Field>
            </div>
            <Field label={kind === "korrektur" ? "Begründung der Korrektur" : "Interne Bemerkung"} required={kind === "korrektur"} error={fe.remark}><Textarea name="remark" rows={2} defaultValue={edit?.remark ?? ""} /></Field>
            <div className="flex justify-end gap-2"><button type="button" className={btn.secondary} onClick={close}>Abbrechen</button><SubmitButton>Speichern</SubmitButton></div>
          </>
        );
      }}
    </ActionForm>
  );
}

/* Client wrappers so server pages don't pass render functions across the boundary. */
type FoundationProps = Omit<Parameters<typeof FoundationForm>[0], "close">;
type OrderProps = Omit<Parameters<typeof OrderForm>[0], "close">;
type TxProps = Omit<Parameters<typeof TransactionForm>[0], "close">;

export function FoundationToggle({ label, variant, ...p }: FoundationProps & { label: string; variant?: keyof typeof btn }) {
  return <Toggle label={label} variant={variant}>{(close) => <FoundationForm {...p} close={close} />}</Toggle>;
}
export function OrderToggle({ label, variant, ...p }: OrderProps & { label: string; variant?: keyof typeof btn }) {
  return <Toggle label={label} variant={variant}>{(close) => <OrderForm {...p} close={close} />}</Toggle>;
}
export function TransactionToggle({ label, variant, ...p }: TxProps & { label: string; variant?: keyof typeof btn }) {
  return <Toggle label={label} variant={variant}>{(close) => <TransactionForm {...p} close={close} />}</Toggle>;
}
