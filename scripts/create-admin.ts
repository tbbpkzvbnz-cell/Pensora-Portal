/**
 * Creates the first Pensora GL account (bootstrap). Usage:
 *   npm run admin:create -- --first Vorname --last Nachname --email a@b.ch --phone +41791234567
 * The password is read from the env var ADMIN_PASSWORD or prompted.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";
import { hash } from "@node-rs/argon2";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const first = arg("first"), last = arg("last"), email = arg("email")?.toLowerCase(), phone = arg("phone")?.replace(/\s/g, "");
  if (!first || !last || !email || !phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    console.error("Benötigt: --first --last --email --phone (+41…)");
    process.exit(1);
  }
  let pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    pw = await rl.question("Passwort (mind. 12 Zeichen): ");
    rl.close();
  }
  if (!pw || pw.length < 12) throw new Error("Passwort zu kurz");
  const sql = postgres(process.env.DATABASE_URL!);
  const passwordHash = await hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 });
  const [u] = await sql`insert into users (first_name, last_name, email, phone, role, password_hash, password_changed_at)
    values (${first}, ${last}, ${email}, ${phone}, 'pensora_gl', ${passwordHash}, now()) returning id`;
  await sql`insert into activity_log (action, entity_type, entity_id, summary, actor_label) values ('user.create', 'user', ${u.id}, 'Erster Pensora-GL-Benutzer per CLI erstellt', 'System')`;
  console.log("Pensora GL erstellt:", u.id);
  await sql.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
