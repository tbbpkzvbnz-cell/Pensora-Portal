/** Takes preview screenshots of the main pages per role (fictitious demo data). */
import { readFileSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
const BASE = "http://localhost:3100", LOG = "/tmp/dev.log", PW = "Demo-Passwort-2026!", OUT = "/tmp/tour";
const code = (phone: string) => {
  const l = readFileSync(LOG, "utf8").split("\n").filter((x) => x.includes(`an ${phone}`) && x.includes("Anmeldecode"));
  return /Anmeldecode: (\d{6})/.exec(l.at(-1) ?? "")![1];
};
async function login(b: Browser, email: string, phone: string) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "de-CH", deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.append(s); }); });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="identifier"]', email);
  await p.fill('input[name="password"]', PW);
  await p.click('button[type="submit"]');
  await p.waitForURL("**/login/code");
  await p.waitForTimeout(400);
  await p.fill('input[name="code"]', code(phone));
  await p.click('button[type="submit"]:has-text("Anmelden")');
  await p.waitForURL("**/dashboard");
  return p;
}
async function main() {
  const [appId, custId, openAppId] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
  const anon = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await anon.goto(`${BASE}/login`); await anon.waitForTimeout(800);
  await anon.screenshot({ path: `${OUT}/00-login.png` });
  const gl = await login(b, "gl@demo.example.ch", "+41790000001");
  const pages: [string, string][] = [
    ["01-dashboard-gl", "/dashboard"], ["02-kunden", "/kunden"], ["03-kundenakte", `/kunden/${custId}`],
    ["04-antraege", "/antraege?view=alle"], ["05-antrag", `/antraege/${appId}`], ["06-pruefung", "/pruefung"],
    ["07-pruefung-detail", `/pruefung/${openAppId}`], ["08-uebermittlungen", "/pruefung/uebermittlungen"],
    ["09-portfolio", "/portfolio"], ["10-portfolio-kunde", `/portfolio/${custId}?tab=transaktionen`],
    ["11-mitarbeiter", "/mitarbeiter"], ["12-rollen", "/einstellungen/rollen"],
    ["13-integrationen", "/einstellungen/integrationen"], ["14-protokoll", "/einstellungen/protokoll"],
  ];
  for (const [n, u] of pages) { await gl.goto(BASE + u); await gl.waitForTimeout(900); await gl.screenshot({ path: `${OUT}/${n}.png` }); console.log(n); }
  const adv = await login(b, "bea@alpha.example.ch", "+41790000007");
  await adv.waitForTimeout(800); await adv.screenshot({ path: `${OUT}/15-dashboard-broker-berater.png` });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
