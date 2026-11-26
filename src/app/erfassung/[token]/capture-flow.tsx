"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Camera, Check, ImageUp, RotateCcw } from "lucide-react";
import { btn } from "@/components/ui";

type Step = "front" | "back" | "signature" | "review" | "done";

/** Downscales and re-encodes a photo to JPEG (also converts HEIC where the browser can decode it). */
async function toJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Bild konnte nicht gelesen werden. Bitte JPG oder PNG verwenden."));
      i.src = url;
    });
    const max = 2000;
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Konvertierung fehlgeschlagen"))), "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PhotoStep({ title, hint, value, onChange, optionalExisting }: { title: string; hint: string; value: Blob | null; onChange: (b: Blob | null) => void; optionalExisting?: boolean }) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Object URLs are an external resource that must be revoked, so an effect is the right place.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!value) return setPreview(null);
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  const handle = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    try {
      onChange(await toJpeg(f));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">{hint}</p>
        {optionalExisting && !value && <p className="mt-1 text-sm text-emerald-700">Bereits vorhanden – Sie können diesen Schritt überspringen oder neu erfassen.</p>}
      </div>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={title} className="w-full rounded-xl border border-line bg-white object-contain" />
      ) : (
        <div className="flex aspect-[1.586] w-full items-center justify-center rounded-xl border-2 border-dashed border-brand-200 bg-white text-sm text-muted">Noch kein Bild</div>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      <input ref={galRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btn.primary} onClick={() => camRef.current?.click()}>
          {value ? <RotateCcw className="h-4 w-4" /> : <Camera className="h-4 w-4" />} {value ? "Neu aufnehmen" : "Foto aufnehmen"}
        </button>
        <button type="button" className={btn.secondary} onClick={() => galRef.current?.click()}><ImageUp className="h-4 w-4" /> Aus Galerie</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

function SignaturePad({ value, onChange }: { value: Blob | null; onChange: (b: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    if (value) {
      const u = URL.createObjectURL(value);
      // Object URLs are an external resource that must be revoked, so an effect is the right place.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(u);
      return () => URL.revokeObjectURL(u);
    }
    setPreview(null);
  }, [value]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || value) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, [value]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const clear = () => {
    const c = canvasRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    setEmpty(true);
  };

  /** Crops to the drawn area and exports a transparent PNG. */
  const accept = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 0) {
      if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    if (maxX - minX < 20 || maxY - minY < 10) return;
    const pad = 10;
    const out = document.createElement("canvas");
    out.width = maxX - minX + 2 * pad;
    out.height = maxY - minY + 2 * pad;
    out.getContext("2d")!.drawImage(c, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
    out.toBlob((b) => b && onChange(b), "image/png");
  };

  if (value && preview) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Unterschrift kontrollieren</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Unterschrift" className="mx-auto max-h-40 rounded-xl border border-line bg-white p-3" />
        <button type="button" className={clsx(btn.secondary, "w-full")} onClick={() => onChange(null)}><RotateCcw className="h-4 w-4" /> Unterschrift wiederholen</button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Unterschrift</h2>
        <p className="text-sm text-muted">Bitte unterschreiben Sie mit dem Finger, Stift, Touchpad oder der Maus im Feld.</p>
      </div>
      <canvas
        ref={canvasRef}
        className="h-48 w-full touch-none rounded-xl border-2 border-brand-200 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 0.1, p.y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          if (!dirty.current) { dirty.current = true; setEmpty(false); }
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
        aria-label="Unterschriftsfeld"
      />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btn.secondary} onClick={clear}>Löschen</button>
        <button type="button" className={btn.primary} onClick={accept} disabled={empty}><Check className="h-4 w-4" /> Übernehmen</button>
      </div>
    </div>
  );
}

export function CaptureFlow({ token, hasIdFront, hasIdBack }: { token: string; hasIdFront: boolean; hasIdBack: boolean }) {
  const [step, setStep] = useState<Step>("front");
  const [front, setFront] = useState<Blob | null>(null);
  const [back, setBack] = useState<Blob | null>(null);
  const [sig, setSig] = useState<Blob | null>(null);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const steps: Step[] = ["front", "back", "signature", "review"];
  const idx = steps.indexOf(step);
  const canNext = step === "front" ? !!front || hasIdFront : step === "back" ? !!back || hasIdBack : step === "signature" ? !!sig : false;

  const submit = async () => {
    setSending(true);
    setError(null);
    const fd = new FormData();
    if (front) fd.append("idFront", front, "front.jpg");
    if (back) fd.append("idBack", back, "back.jpg");
    fd.append("signature", sig!, "signature.png");
    try {
      const res = await fetch(`/api/erfassung/${encodeURIComponent(token)}`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Übermittlung fehlgeschlagen. Bitte erneut versuchen.");
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (step === "done") {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <Check className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-2 text-lg font-semibold">Vielen Dank!</h2>
        <p className="mt-1 text-sm text-emerald-900">Ihre Unterlagen wurden sicher übermittelt. Ihr Berater wurde benachrichtigt. Sie können dieses Fenster schliessen.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <ol className="flex gap-2" aria-label="Fortschritt">
        {steps.map((s, i) => <li key={s} className={clsx("h-1.5 flex-1 rounded-full", i <= idx ? "bg-brand-600" : "bg-brand-100")} />)}
      </ol>
      <div className="rounded-2xl border border-line bg-white p-5">
        {step === "front" && <PhotoStep title="ID – Vorderseite" hint="Legen Sie die Identitätskarte bzw. die Passseite mit Foto auf eine dunkle Fläche. Alle Angaben müssen gut lesbar sein." value={front} onChange={setFront} optionalExisting={hasIdFront} />}
        {step === "back" && <PhotoStep title="ID – Rückseite" hint="Bei einem Pass fotografieren Sie bitte die Seite mit der Unterschrift." value={back} onChange={setBack} optionalExisting={hasIdBack} />}
        {step === "signature" && <SignaturePad value={sig} onChange={setSig} />}
        {step === "review" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Zusammenfassung</h2>
            <ul className="space-y-1 text-sm">
              <li>✓ ID Vorderseite {front ? "erfasst" : "bereits vorhanden"}</li>
              <li>✓ ID Rückseite {back ? "erfasst" : "bereits vorhanden"}</li>
              <li>✓ Unterschrift erfasst</li>
            </ul>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-brand-600" />
              <span>Ich bevollmächtige die Pensora GmbH, mich gegenüber dem Sicherheitsfonds BVG – Zentralstelle 2. Säule sowie den zuständigen Vorsorge- und Freizügigkeitseinrichtungen zu vertreten, und bestätige, dass meine Angaben richtig und vollständig sind. Meine Unterschrift wird in das Vollmachtformular übernommen.</span>
            </label>
            {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <button type="button" className={clsx(btn.primary, "w-full py-3")} disabled={!consent || sending} onClick={submit}>{sending ? "Wird übermittelt…" : "Unterlagen absenden"}</button>
          </div>
        )}
      </div>
      <div className="flex justify-between">
        <button type="button" className={btn.ghost} disabled={idx === 0 || sending} onClick={() => setStep(steps[idx - 1])}>‹ Zurück</button>
        {step !== "review" && <button type="button" className={btn.primary} disabled={!canNext} onClick={() => setStep(steps[idx + 1])}>Weiter ›</button>}
      </div>
    </div>
  );
}
