/**
 * DEMO-DATEN NUR FÜR ENTWICKLUNG/TEST. Alle Personen sind frei erfunden (example.ch, Musternamen).
 * Verweigert die Ausführung in Produktion. Passwort aller Demo-Benutzer: DEMO_PASSWORD oder "Demo-Passwort-2026!".
 */
import "dotenv/config";
import postgres from "postgres";
import { hash } from "@node-rs/argon2";

if (process.env.NODE_ENV === "production") {
  console.error("seed:demo ist in Produktion gesperrt.");
  process.exit(1);
}

function ahv(n: number) {
  const base = ("756" + String(1000000000 + n * 7919).slice(-9)).padEnd(12, "0");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  return base + ((10 - (sum % 10)) % 10);
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const [{ n }] = await sql`select count(*)::int as n from users`;
  if (n > 0 && !process.argv.includes("--force")) {
    console.error("Es existieren bereits Benutzer. Abbruch (mit --force trotzdem ausführen).");
    process.exit(1);
  }
  const pw = await hash(process.env.DEMO_PASSWORD ?? "Demo-Passwort-2026!", { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 });
  const [b1] = await sql`insert into broker_firms (name, city, email) values ('Demo Broker Alpha AG', 'Musterstadt', 'info@alpha.example.ch') returning id`;
  const [b2] = await sql`insert into broker_firms (name, city, email) values ('Demo Broker Beta GmbH', 'Beispielwil', 'info@beta.example.ch') returning id`;
  const mk = async (first: string, last: string, email: string, phone: string, role: string, broker: string | null) =>
    (await sql`insert into users (first_name, last_name, email, phone, role, broker_firm_id, password_hash, password_changed_at)
      values (${first}, ${last}, ${email}, ${phone}, ${role}, ${broker}, ${pw}, now()) returning id`)[0].id as string;
  const gl = await mk("Gabriela", "Leitung", "gl@demo.example.ch", "+41790000001", "pensora_gl", null);
  await mk("Boris", "Backoffice", "backoffice@demo.example.ch", "+41790000002", "pensora_backoffice", null);
  await mk("Clara", "Closer", "closer@demo.example.ch", "+41790000003", "pensora_closer", null);
  const pb = await mk("Paul", "Pensora", "berater@demo.example.ch", "+41790000004", "pensora_advisor", null);
  await mk("Anna", "Alpha-Chef", "gl@alpha.example.ch", "+41790000005", "broker_gl", b1.id);
  const ba1 = await mk("Bruno", "Alpha", "bruno@alpha.example.ch", "+41790000006", "broker_advisor", b1.id);
  const ba2 = await mk("Bea", "Alpha", "bea@alpha.example.ch", "+41790000007", "broker_advisor", b1.id);
  await mk("Beat", "Beta-Chef", "gl@beta.example.ch", "+41790000008", "broker_gl", b2.id);
  const bb1 = await mk("Berta", "Beta", "berta@beta.example.ch", "+41790000009", "broker_advisor", b2.id);
  const owners = [
    [pb, null],
    [ba1, b1.id],
    [ba2, b1.id],
    [bb1, b2.id],
  ] as const;
  const first = ["Max", "Erika", "Hans", "Petra", "Urs", "Monika", "Peter", "Sandra"];
  const last = ["Mustermann", "Musterfrau", "Beispiel", "Muster", "Probst", "Test", "Demo", "Fiktiv"];
  let i = 0;
  for (const [adv, broker] of owners) {
    for (let k = 0; k < 3; k++) {
      i++;
      await sql`insert into customers (first_name, last_name, birth_date, ahv_number, street, postal_code, city, phone, email, advisor_id, broker_firm_id, created_by)
        values (${first[i % 8]}, ${last[(i * 3) % 8]}, ${`19${60 + i}-0${(i % 9) + 1}-1${i % 9}`}, ${ahv(i)}, ${`Musterweg ${i}`}, ${"8000"}, ${"Musterstadt"},
                ${`+4179000${String(1000 + i)}`}, ${`kunde${i}@example.ch`}, ${adv}, ${broker}, ${adv})`;
    }
  }
  for (const f of ["Demo Freizügigkeitsstiftung A", "Demo Sammelstiftung B", "Demo Auffangstiftung C"]) await sql`insert into foundations (name) values (${f})`;
  await sql`insert into activity_log (action, entity_type, summary, actor_label, actor_id) values ('seed', 'system', 'Demo-Daten erstellt (fiktiv)', 'System', ${gl})`;
  console.log("Demo-Daten erstellt. Benutzer: gl@demo.example.ch, backoffice@demo.example.ch, berater@demo.example.ch, gl@alpha.example.ch, bruno@alpha.example.ch, …");
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
