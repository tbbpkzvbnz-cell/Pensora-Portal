"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { ROLE_LABELS, ROLES, BROKER_ROLES, type Role } from "@/server/authz/permissions";

type U = { id?: string; firstName: string; lastName: string; email: string; phone: string; role: Role; brokerFirmId: string | null };

export function UserForm({
  action,
  user,
  brokers,
  withPassword,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  user?: U;
  brokers: { id: string; name: string; active: boolean }[];
  withPassword?: boolean;
}) {
  const [role, setRole] = useState<Role>(user?.role ?? "broker_advisor");
  const isBroker = BROKER_ROLES.includes(role);
  return (
    <ActionForm action={action} className="space-y-4">
      {(s) => {
        const v = (k: keyof U) => s?.values?.[k] ?? (user?.[k] as string | undefined) ?? "";
        const fe = s?.fieldErrors ?? {};
        return (
          <>
            {user?.id && <input type="hidden" name="id" value={user.id} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vorname" required error={fe.firstName}><Input name="firstName" defaultValue={v("firstName")} required /></Field>
              <Field label="Nachname" required error={fe.lastName}><Input name="lastName" defaultValue={v("lastName")} required /></Field>
              <Field label="E-Mail" required error={fe.email}><Input name="email" type="email" defaultValue={v("email")} required /></Field>
              <Field label="Telefonnummer (für SMS-2FA)" required error={fe.phone} hint="z.B. +41 79 123 45 67"><Input name="phone" type="tel" defaultValue={v("phone")} required /></Field>
              <Field label="Benutzerrolle" required error={fe.role}>
                <Select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}{r === "pensora_closer" ? " (vorbereitet)" : ""}</option>)}
                </Select>
              </Field>
              <Field label="Brokerfirma" required={isBroker} error={fe.brokerFirmId} hint={isBroker ? undefined : "Nur für externe Broker-Rollen"}>
                <Select name="brokerFirmId" defaultValue={v("brokerFirmId")} disabled={!isBroker} key={String(isBroker)}>
                  <option value="">{isBroker ? "Bitte wählen…" : "Pensora (intern)"}</option>
                  {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.active ? "" : " (inaktiv)"}</option>)}
                </Select>
              </Field>
              {withPassword && (
                <Field label="Initiales Passwort" required error={fe.password} hint="Mind. 12 Zeichen, drei Zeichenarten. Der Benutzer kann es später ändern.">
                  <Input name="password" type="password" autoComplete="new-password" required />
                </Field>
              )}
            </div>
            <div className="flex justify-end"><SubmitButton>{user?.id ? "Speichern" : "Benutzer erstellen"}</SubmitButton></div>
          </>
        );
      }}
    </ActionForm>
  );
}
