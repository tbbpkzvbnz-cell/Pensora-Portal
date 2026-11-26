import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import { LOCKED_GL_PERMISSIONS, PERMISSIONS, ROLE_LABELS, ROLE_SCOPE, ROLES, type Permission } from "@/server/authz";
import { getPermissionMatrix } from "@/server/services/settings";
import { PageHeader, Table, Td, Th } from "@/components/ui";
import { SettingsTabs } from "../nav";
import { togglePermissionAction } from "../actions";

export const metadata: Metadata = { title: "Rollen & Berechtigungen" };

const SCOPE = { all: "Alle Kunden", submitted: "Kunden mit eingereichtem Antrag", firm: "Kunden der eigenen Brokerfirma", own: "Nur eigene Kunden", none: "Keine" };

export default async function RolesPage() {
  const actor = await requireActor("settings.manage");
  const matrix = await getPermissionMatrix();
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Rollen und Berechtigungen werden zentral verwaltet und serverseitig bei jedem Zugriff geprüft." />
      <SettingsTabs actor={actor} active="rollen" />
      <p className="mb-4 text-sm text-muted">
        Der Datenbereich jeder Rolle (welche Kunden sichtbar sind) ist fest definiert. Funktionsrechte können hier freigeschaltet werden – z.B. Statusänderungen für Backoffice oder die Aktivierung der Rolle Pensora Closer.
        Änderungen wirken sofort und werden protokolliert.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Berechtigung</Th>
            {ROLES.map((r) => <Th key={r} className="text-center">{ROLE_LABELS[r]}</Th>)}
          </tr>
          <tr>
            <Td className="text-xs text-muted">Datenbereich</Td>
            {ROLES.map((r) => <Td key={r} className="text-center text-xs text-muted">{SCOPE[ROLE_SCOPE[r]]}</Td>)}
          </tr>
        </thead>
        <tbody>
          {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
            <tr key={p} className="hover:bg-surface">
              <Td>{PERMISSIONS[p]}</Td>
              {ROLES.map((r) => {
                const on = matrix[r][p];
                const locked = r === "pensora_gl" && LOCKED_GL_PERMISSIONS.includes(p);
                return (
                  <Td key={r} className="text-center">
                    <form action={togglePermissionAction}>
                      <input type="hidden" name="role" value={r} />
                      <input type="hidden" name="permission" value={p} />
                      <input type="hidden" name="allowed" value={String(!on)} />
                      <button
                        disabled={locked}
                        title={locked ? "Kann nicht entzogen werden" : on ? "Entziehen" : "Erteilen"}
                        aria-label={`${PERMISSIONS[p]} für ${ROLE_LABELS[r]} ${on ? "entziehen" : "erteilen"}`}
                        className={`inline-flex h-6 w-10 items-center rounded-full p-0.5 transition ${on ? "bg-brand-600" : "bg-gray-200"} disabled:opacity-50`}
                      >
                        <span className={`h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-4" : ""}`} />
                      </button>
                    </form>
                  </Td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
