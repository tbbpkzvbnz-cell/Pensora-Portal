"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import type { ActionState } from "@/lib/action-state";
import { btn } from "./ui";

export function SubmitButton({ children, variant = "primary", className, pendingText }: { children: ReactNode; variant?: keyof typeof btn; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clsx(btn[variant], className)}>
      {pending ? pendingText ?? "Wird gespeichert…" : children}
    </button>
  );
}

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Form bound to a server action; shows error/success messages and field errors via render-prop. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: FormAction;
  children: (state: ActionState) => ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.success) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} noValidate>
      {state?.error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</div>
      )}
      {state?.success && (
        <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{state.success}</div>
      )}
      {children(state)}
    </form>
  );
}

/**
 * Button that opens a confirmation dialog before submitting a server action.
 * `fields` are sent as hidden inputs.
 */
export function ConfirmAction({
  action,
  fields,
  label,
  title,
  message,
  confirmLabel = "Bestätigen",
  variant = "secondary",
  danger,
  children,
}: {
  action: FormAction;
  fields?: Record<string, string>;
  label: ReactNode;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  variant?: keyof typeof btn;
  danger?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);
  // Close the dialog once per successful submit (state adjustment during render, no effect needed).
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state?.success) setOpen(false);
  }
  return (
    <>
      <button type="button" className={btn[variant]} onClick={() => setOpen(true)}>{label}</button>
      {state?.error && !open && <span className="text-sm text-red-700">{state.error}</span>}
      <dialog ref={dialogRef} onClose={() => setOpen(false)} className="m-auto w-[min(92vw,480px)] rounded-xl border border-line p-0 shadow-xl backdrop:bg-black/30">
        <form action={formAction} className="p-6">
          {Object.entries(fields ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <h3 className="text-lg font-semibold">{title}</h3>
          <div className="mt-2 text-sm text-muted">{message}</div>
          {children && <div className="mt-4 space-y-3">{children}</div>}
          {state?.error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>Abbrechen</button>
            <SubmitButton variant={danger ? "danger" : "primary"} pendingText="Bitte warten…">{confirmLabel}</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
