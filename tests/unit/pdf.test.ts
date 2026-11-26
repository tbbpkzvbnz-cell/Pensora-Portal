import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderVollmacht } from "@/server/pdf/vollmacht";

// Fictitious data only.
const form = {
  lastName: "Muster",
  firstName: "Erika",
  birthDate: "1980-01-15",
  ahvNumber: "7561234567897",
  street: "Beispielweg 1",
  postalCode: "8000",
  city: "Zürich",
  phone: "+41790000001",
  email: "erika.muster@example.ch",
};

describe("Vollmacht-PDF", () => {
  it("fills the original template (1 page) and appends one ID page with front and back", async () => {
    const plain = await PDFDocument.load(await renderVollmacht({ form: form as never, applicationDate: "2026-11-26" }));
    expect(plain.getPageCount()).toBe(1);
    expect(plain.getPage(0).getSize()).toEqual({ width: 612, height: 792 });

    // 1×1 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const full = await PDFDocument.load(
      await renderVollmacht({
        form: form as never,
        applicationDate: "2026-11-26",
        signaturePng: png,
        idFront: { data: png, mime: "image/png", label: "Ausweis Vorderseite" },
        idBack: { data: png, mime: "image/png", label: "Ausweis Rückseite" },
        preview: true,
      }),
    );
    expect(full.getPageCount()).toBe(2);
  });
});
