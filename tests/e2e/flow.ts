/**
 * End-to-end smoke test of the main business flow with fictitious data.
 * Requires: dev server (SMS_PROVIDER=dev-log, log written to $DEV_LOG), seeded demo users, Chrome.
 *   BASE=http://localhost:3100 DEV_LOG=/tmp/dev.log npx tsx tests/e2e/flow.ts
 */
import { readFileSync } from "node:fs";
import { chromium, type Page, type Browser } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3100";
const LOG = process.env.DEV_LOG ?? "/tmp/dev.log";
const PW = process.env.DEMO_PASSWORD ?? "Demo-Passwort-2026!";
const SHOTS = process.env.SHOTS ?? "/tmp/shots";
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";

let failures = 0;
function check(cond: unknown, msg: string) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
}

function lastCode(phone: string): string {
  const lines = readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes(`an ${phone}`) && l.includes("Anmeldecode"));
  const m = /Anmeldecode: (\d{6})/.exec(lines.at(-1) ?? "");
  if (!m) throw new Error("Kein OTP im Log für " + phone);
  return m[1];
}

async function login(browser: Browser, email: string, phone: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "de-CH" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/login/code");
  await page.waitForTimeout(300);
  await page.fill('input[name="code"]', lastCode(phone));
  await page.click('button[type="submit"]:has-text("Anmelden")');
  await page.waitForURL("**/dashboard");
  return page;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function confirmDialog(page: Page, buttonText: string, confirmText: string) {
  await page.click(`button:has-text("${buttonText}")`);
  await page.click(`dialog[open] button[type="submit"]:has-text("${confirmText}")`);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const suffix = Date.now().toString().slice(-5);

  // 1) Wrong password is rejected
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name="identifier"]', "bruno@alpha.example.ch");
    await p.fill('input[name="password"]', "falsch-falsch-falsch");
    await p.click('button[type="submit"]');
    await p.waitForSelector('form [role="alert"]');
    check((await p.textContent('form [role="alert"]'))?.includes("falsch"), "Falsches Passwort wird abgelehnt");
    await ctx.close();
  }

  // 2) Advisor creates customer and starts application
  const adv = await login(browser, "bruno@alpha.example.ch", "+41790000006");
  check(adv.url().endsWith("/dashboard"), "Berater: Login mit SMS-Code");
  await shot(adv, "01-dashboard-berater");
  check(!(await adv.isVisible('nav >> text="Überprüfungen & Übermittlungen"')), "Berater sieht Prüfung nicht im Menü");
  await adv.goto(`${BASE}/kunden/neu`);
  await adv.fill('input[name="firstName"]', "Testa");
  await adv.fill('input[name="lastName"]', `Fiktiv${suffix}`);
  await adv.fill('input[name="birthDate"]', "1970-05-17");
  await adv.fill('input[name="ahvNumber"]', "756.1234.5678.98");
  await adv.fill('input[name="street"]', "Testweg 1");
  await adv.fill('input[name="postalCode"]', "8000");
  await adv.fill('input[name="city"]', "Musterstadt");
  await adv.fill('input[name="phone"]', `079 555 ${suffix.slice(0, 2)} ${suffix.slice(2, 4)}`);
  await adv.fill('input[name="email"]', `testa${suffix}@example.ch`);
  await adv.click('button:has-text("Kunde erfassen")');
  await adv.waitForTimeout(800);
  check(await adv.isVisible("text=Ungültige AHV-Nummer"), "Ungültige AHV-Prüfziffer wird erkannt");
  // compute valid AHV with a random middle part
  const digits = "756" + suffix + "1234";
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  const ahv = digits + ((10 - (sum % 10)) % 10);
  await adv.fill('input[name="ahvNumber"]', ahv);
  await adv.click('button:has-text("Kunde erfassen")');
  await adv.waitForURL(/\/kunden\/[0-9a-f-]{36}\?neu=1/);
  const customerUrl = adv.url().split("?")[0];
  const customerId = customerUrl.split("/").pop()!;
  check(await adv.isVisible("text=Neu erfasst"), "Kunde erfasst mit Status „Neu erfasst“");
  await shot(adv, "02-kundenakte");
  await confirmDialog(adv, "Freizügigkeitsanfrage auslösen", "Antrag starten");
  await adv.waitForURL(/\/antraege\/[0-9a-f-]{36}$/);
  const appUrl = adv.url();
  const appId = appUrl.split("/").pop()!;
  check(true, "Freizügigkeitsanfrage gestartet");
  const preview = await adv.request.get(`${BASE}/api/antraege/${appId}/vorschau`);
  check(preview.ok() && (await preview.body()).subarray(0, 5).toString() === "%PDF-", "PDF-Vorschau aus Originalformular wird erzeugt");
  await adv.click('button:has-text("Link per SMS senden")');
  await adv.waitForSelector("text=Erfassungslink per SMS gesendet");
  const link = (await adv.textContent("div.font-mono"))!.trim();
  check(link.includes("/erfassung/"), "Erfassungslink erstellt und per SMS (Dev-Log) gesendet");
  await shot(adv, "03-antrag-entwurf");

  // 3) Customer captures ID + signature on mobile
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "de-CH" });
  const cp = await mob.newPage();
  await cp.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
  await shot(cp, "04-erfassung-start");
  await cp.setInputFiles('input[type="file"][capture]', `${SHOTS}/id_front.jpg`);
  await cp.waitForSelector('img[alt="ID – Vorderseite"]');
  await cp.click('button:has-text("Weiter")');
  await cp.setInputFiles('input[type="file"]:not([capture])', `${SHOTS}/id_back.jpg`);
  await cp.waitForSelector('img[alt="ID – Rückseite"]');
  await cp.click('button:has-text("Weiter")');
  const box = (await cp.locator("canvas").boundingBox())!;
  await cp.mouse.move(box.x + 30, box.y + 120);
  await cp.mouse.down();
  for (let i = 0; i <= 30; i++) await cp.mouse.move(box.x + 30 + i * 9, box.y + 120 - Math.sin(i / 3) * 40);
  await cp.mouse.up();
  await cp.click('button:has-text("Übernehmen")');
  await cp.waitForSelector('img[alt="Unterschrift"]');
  await shot(cp, "05-erfassung-unterschrift");
  await cp.click('button:has-text("Weiter")');
  await cp.check('input[type="checkbox"]');
  await cp.click('button:has-text("Unterlagen absenden")');
  await cp.waitForSelector("text=Vielen Dank");
  check(true, "Kunde hat ID und Unterschrift mobil übermittelt");
  await shot(cp, "06-erfassung-fertig");
  await cp.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
  check(await cp.isVisible("text=Bereits erfasst"), "Link ist danach nicht mehr verwendbar");
  await mob.close();

  await adv.goto(appUrl);
  check(await adv.isVisible("text=Neu eingegangen"), "Antrag automatisch an Pensora übergeben");
  check(await adv.isVisible("text=Vollständiges PDF herunterladen"), "Vollständiges PDF erstellt");

  // 4) Access control: another broker's advisor cannot see this customer
  const other = await login(browser, "berta@beta.example.ch", "+41790000009");
  const r1 = await other.goto(customerUrl);
  check(r1?.status() === 404, "Fremder Berater: Kundenakte per URL → 404");
  const r2 = await other.request.get(`${BASE}/api/antraege/${appId}/vorschau`);
  check(r2.status() === 404, "Fremder Berater: Antrags-PDF per API → 404");
  const r3 = await other.goto(`${BASE}/pruefung`);
  check(r3?.url().includes("/kein-zugriff"), "Berater: /pruefung gesperrt");
  const r4 = await other.request.get(`${BASE}/api/export/kunden`);
  check(r4.status() === 403, "Berater: Export gesperrt");
  const bgl = await login(browser, "gl@alpha.example.ch", "+41790000005");
  check((await bgl.goto(customerUrl))?.status() === 200, "Broker GL derselben Firma sieht Kunden");
  const bgl2 = await login(browser, "gl@beta.example.ch", "+41790000008");
  check((await bgl2.goto(customerUrl))?.status() === 404, "Broker GL anderer Firma sieht Kunden nicht");

  // 5) Back office reviews
  const bo = await login(browser, "backoffice@demo.example.ch", "+41790000002");
  await bo.goto(`${BASE}/pruefung`);
  await shot(bo, "07-pruefung-eingang");
  await bo.click(`a:has-text("Fiktiv${suffix}")`);
  await bo.waitForURL(/\/pruefung\/[0-9a-f-]{36}$/);
  await bo.selectOption('select[name="status"]', "rueckfrage_erforderlich");
  await bo.click('button:has-text("Status speichern")');
  await bo.waitForSelector("text=Bitte eine interne Notiz");
  check(true, "Rückfrage ohne Notiz wird abgelehnt");
  await bo.selectOption('select[name="status"]', "bereit_zur_uebermittlung");
  await bo.fill('textarea[name="note"]', "");
  await bo.click('button:has-text("Status speichern")');
  await bo.waitForSelector("text=Status gespeichert");
  await bo.reload();
  check(await bo.isVisible("text=Bereit zur Übermittlung"), "Backoffice: Status Bereit zur Übermittlung");
  await shot(bo, "08-pruefung-detail");
  const emailActive = !(await bo.isVisible("text=E-Mail-Integration nicht aktiv"));
  if (emailActive) {
    await bo.click('button:has-text("E-Mail senden")');
    await bo.waitForSelector("text=Versandprotokoll", { timeout: 20000 });
    check(await bo.isVisible("text=Versendet") && (await bo.isVisible("text=Warten auf Antwort")), "Übermittlung an Zentralstelle versendet, protokolliert, Status „Warten auf Antwort“");
  } else {
    check(await bo.isDisabled('button:has-text("E-Mail senden")'), "Ohne E-Mail-Integration ist der Versand deaktiviert");
  }
  check((await bo.goto(`${BASE}/mitarbeiter`))?.url().includes("/kein-zugriff"), "Backoffice: Mitarbeiterverwaltung gesperrt");

  // 6) GL: outcome + portfolio
  const gl = await login(browser, "gl@demo.example.ch", "+41790000001");
  await shot(gl, "09-dashboard-gl");
  if (emailActive) {
    await gl.goto(appUrl);
    await gl.selectOption('select[name="status"]', "konto_eroeffnet");
    await gl.click('button:has-text("Status speichern")');
    await gl.waitForSelector("text=Antragsstatus geändert");
    await gl.goto(`${BASE}/portfolio/${customerId}`);
    await confirmDialog(gl, "Ins Portfolio aufnehmen", "Aufnehmen");
    await gl.waitForTimeout(800);
    await gl.goto(`${BASE}/portfolio/${customerId}?tab=stiftungen`);
    await gl.click('button:has-text("Stiftung hinzufügen")');
    await gl.selectOption('select[name="foundationId"]', { label: "Demo Freizügigkeitsstiftung A" });
    await gl.click('button:has-text("Speichern")');
    await gl.waitForSelector('td:has-text("Demo Freizügigkeitsstiftung A")');
    await gl.goto(`${BASE}/portfolio/${customerId}?tab=transaktionen`);
    await gl.click('button:has-text("Neue Transaktion")');
    await gl.selectOption('select[name="foundationId"]', { label: "Demo Freizügigkeitsstiftung A" });
    await gl.fill('input[name="amount"]', "35'000.00");
    await gl.fill('input[name="receivedOn"]', "2026-11-20");
    await gl.click('button:has-text("Speichern")');
    await gl.waitForSelector('td:has-text("20.11.2026")');
    await gl.goto(`${BASE}/portfolio/${customerId}`);
    check(await gl.isVisible("text=CHF 35’000.00") || await gl.isVisible("text=CHF 35'000.00"), "Portfolio-Gesamtbetrag aus Transaktion berechnet");
    await shot(gl, "10-portfolio-detail");
    const ro = await adv.goto(`${BASE}/portfolio/${customerId}?tab=transaktionen`);
    check(ro?.status() === 200 && !(await adv.isVisible('button:has-text("Neue Transaktion")')), "Berater: Portfolio nur lesend");
  }
  await gl.goto(`${BASE}/einstellungen/rollen`);
  await shot(gl, "11-rollen");
  await browser.close();
  console.log(failures === 0 ? "\nALLE PRÜFUNGEN BESTANDEN" : `\n${failures} PRÜFUNG(EN) FEHLGESCHLAGEN`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
