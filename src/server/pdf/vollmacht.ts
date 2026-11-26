import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { FormSnapshot } from "../db/schema";
import { formatAhv } from "@/lib/ahv";
import { formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";

/**
 * Field positions on the ORIGINAL Pensora authority form (templates/vollmacht.pdf, US-Letter 612×792pt).
 * Measured from the template with `pdftotext -bbox`. Origin bottom-left (pdf-lib).
 * If the template is replaced by a new version with a different layout, only this table must be adjusted.
 */
export const VOLLMACHT_LAYOUT = {
  valueX: 230,
  valueMaxWidth: 300,
  fontSize: 10.5,
  rows: {
    lastName: 564.0,
    firstName: 539.4,
    birthDate: 514.7,
    ahvNumber: 490.1,
    street: 465.5,
    postalCity: 440.8,
    phone: 416.2,
    email: 391.6,
  },
  placeDate: { x: 230, y: 120 },
  signature: { x: 230, y: 70, maxWidth: 220, maxHeight: 46 },
} as const;

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "vollmacht.pdf");

function fit(font: PDFFont, text: string, size: number, maxWidth: number) {
  let s = size;
  while (s > 6 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.25;
  return s;
}

function draw(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, maxWidth: number) {
  page.drawText(text, { x, y, size: fit(font, text, size, maxWidth), font, color: rgb(0.08, 0.08, 0.1) });
}

export type IdAttachment = { data: Buffer; mime: string; label: string };

export type VollmachtInput = {
  form: FormSnapshot;
  /** Application date YYYY-MM-DD */
  applicationDate: string;
  signaturePng?: Buffer | null;
  idFront?: IdAttachment | null;
  idBack?: IdAttachment | null;
  /** adds a "VORSCHAU" watermark */
  preview?: boolean;
};

/** Fills the original template and appends the ID copies as additional pages. */
export async function renderVollmacht(input: VollmachtInput): Promise<Buffer> {
  const pdf = await PDFDocument.load(await readFile(TEMPLATE_PATH));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.getPage(0);
  const L = VOLLMACHT_LAYOUT;
  const f = input.form;
  const values: [keyof typeof L.rows, string][] = [
    ["lastName", f.lastName],
    ["firstName", f.firstName],
    ["birthDate", formatDate(f.birthDate)],
    ["ahvNumber", formatAhv(f.ahvNumber)],
    ["street", f.street],
    ["postalCity", `${f.postalCode} ${f.city}`],
    ["phone", formatPhone(f.phone)],
    ["email", f.email],
  ];
  for (const [k, v] of values) draw(page, font, v, L.valueX, L.rows[k], L.fontSize, L.valueMaxWidth);
  draw(page, font, `${f.city}, ${formatDate(input.applicationDate)}`, L.placeDate.x, L.placeDate.y, L.fontSize, 300);

  if (input.signaturePng) {
    const img = await pdf.embedPng(input.signaturePng);
    const scale = Math.min(L.signature.maxWidth / img.width, L.signature.maxHeight / img.height);
    page.drawImage(img, { x: L.signature.x, y: L.signature.y, width: img.width * scale, height: img.height * scale });
  }

  if (input.preview) {
    page.drawText("VORSCHAU", { x: 150, y: 300, size: 90, font, color: rgb(0.36, 0.09, 0.54), opacity: 0.08, rotate: degrees(30) });
  }

  const ids = [input.idFront, input.idBack].filter(Boolean) as IdAttachment[];
  if (ids.length) await appendIds(pdf, font, ids);

  pdf.setTitle(`Vollmacht ${f.lastName} ${f.firstName}`);
  pdf.setAuthor("Pensora GmbH");
  pdf.setCreator("Pensora-Portal");
  pdf.setProducer("Pensora-Portal");
  return Buffer.from(await pdf.save());
}

async function appendIds(pdf: PDFDocument, font: PDFFont, ids: IdAttachment[]) {
  const W = 612, H = 792, M = 50;
  const images = ids.filter((i) => i.mime !== "application/pdf");
  const pdfs = ids.filter((i) => i.mime === "application/pdf");
  if (images.length) {
    const page = pdf.addPage([W, H]);
    page.drawText("Beilage: Kopie Identitätsnachweis", { x: M, y: H - M, size: 13, font, color: rgb(0.36, 0.09, 0.54) });
    const slotH = (H - 2 * M - 40 - 30) / images.length;
    let top = H - M - 30;
    for (const id of images) {
      const img = id.mime === "image/png" ? await pdf.embedPng(id.data) : await pdf.embedJpg(id.data);
      page.drawText(id.label, { x: M, y: top - 14, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
      const maxW = W - 2 * M, maxH = slotH - 30;
      const s = Math.min(maxW / img.width, maxH / img.height, 1);
      page.drawImage(img, { x: M, y: top - 22 - img.height * s, width: img.width * s, height: img.height * s });
      top -= slotH;
    }
  }
  for (const id of pdfs) {
    const src = await PDFDocument.load(id.data, { ignoreEncryption: false });
    const copied = await pdf.copyPages(src, src.getPageIndices());
    copied.forEach((p) => pdf.addPage(p));
  }
}
