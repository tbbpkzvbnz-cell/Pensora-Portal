import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function numericCode(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += randomInt(0, 10).toString();
  return s;
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** AES-256-GCM. Output layout: [version(1)][iv(12)][tag(16)][ciphertext] */
export function encrypt(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ct]);
}

export function decrypt(blob: Buffer, key: Buffer): Buffer {
  if (blob[0] !== 1) throw new Error("Unbekanntes Verschlüsselungsformat");
  const iv = blob.subarray(1, 13);
  const tag = blob.subarray(13, 29);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(29)), decipher.final()]);
}
