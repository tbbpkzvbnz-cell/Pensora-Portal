# Pensora-Portal

CRM und Verwaltungsportal der Pensora GmbH für die Suche nach vergessenen Freizügigkeitsguthaben: Kunden, Anträge mit Vollmacht, mobile Erfassung (Ausweis + Unterschrift), Prüfung und Übermittlung an die Zentralstelle 2. Säule, Antwortdokumente, Portfolio und Mitarbeiterverwaltung.

Konzept, Datenmodell, Rollenmatrix und offene Fragen: [`docs/phase-1-konzept.md`](docs/phase-1-konzept.md).

## Technik

- Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4
- PostgreSQL 16 mit Drizzle ORM (Migrationen in `drizzle/`)
- Argon2id-Passwörter, Datenbank-Sessions (HttpOnly-Cookie, 30 Min. Inaktivität, 12 h absolut), SMS-2FA bei jedem Login
- Berechtigungen serverseitig: Rechtekatalog plus Rollenrechte in der DB (`src/server/authz`), Datensichtbarkeit pro Rolle direkt in jeder SQL-Abfrage
- Dokumente AES-256-GCM-verschlüsselt (lokal oder S3-kompatibel), Dateityp per Magic Bytes geprüft
- Vollmacht: das **Original-PDF** `templates/vollmacht.pdf` wird befüllt (pdf-lib), Unterschrift und Ausweiskopien werden eingebettet

## Lokal starten

Voraussetzungen: Node.js 20+, PostgreSQL 16.

```bash
npm install
cp .env.example .env.local        # Werte anpassen, siehe Kommentare in der Datei
openssl rand -base64 32           # -> DOCUMENT_ENCRYPTION_KEY
npm run db:migrate                # Tabellen anlegen
npm run admin:create -- --first Vorname --last Nachname --email name@pensora.ch --phone +41791234567
npm run dev                       # http://localhost:3000
```

Ohne SMS-Anbieter kann lokal `SMS_PROVIDER=dev-log` gesetzt werden: Codes und Links erscheinen dann nur im Server-Log. In Produktion verweigert die App diesen Modus.

Optional fiktive Demo-Benutzer (nur Entwicklung, `example.ch`-Adressen): `npm run seed:demo`.

## Integrationen (inaktiv bis Zugangsdaten vorliegen)

| Bereich | Variablen | Anbieter |
|---|---|---|
| SMS | `SMS_PROVIDER`, `SMS_SENDER`, `TWILIO_*` oder `ASPSMS_*` | Twilio oder ASPSMS (CH), austauschbar in `src/server/integrations/sms.ts` |
| E-Mail an Zentralstelle | `SMTP_*` | beliebiger SMTP-Server mit TLS |
| Dokumentablage | `STORAGE_PROVIDER`, `STORAGE_LOCAL_DIR` bzw. S3-Variablen | lokal oder S3-kompatibel (z. B. Schweizer Rechenzentrum) |

Den Status sieht Pensora GL unter *Einstellungen → Integrationen*. Eine fehlgeschlagene Übermittlung wird nie als erfolgreich angezeigt.

## Tests und Prüfungen

```bash
npm run typecheck
npm run lint
npm test                          # Unit-Tests (AHV, Telefon, CSV-Export, Rechte, PDF)
# End-to-End (laufender Dev-Server, SMTP-Testempfänger auf Port 2525, SMS_PROVIDER=dev-log):
BASE=http://localhost:3100 DEV_LOG=/tmp/dev.log npx tsx tests/e2e/flow.ts
```

Der End-to-End-Test spielt den ganzen Ablauf mit allen Rollen durch (Login mit 2FA, Kunde, Antrag, mobile Erfassung, Prüfung, Übermittlung, Ergebnisstatus, Portfolio) und prüft dabei, dass gesperrte Bereiche und fremde Daten wirklich gesperrt sind.

## Produktion

```bash
npm run build && npm start
```

Vor dem Livegang: HTTPS-Domain in `APP_URL`, echte SMS- und SMTP-Zugangsdaten, regelmässige Datenbank-Backups, Hosting in der Schweiz oder EU (revDSG). Offene Punkte stehen in Abschnitt 10 des Konzepts.
