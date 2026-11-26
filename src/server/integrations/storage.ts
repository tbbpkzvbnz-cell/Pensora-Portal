import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env";
import { decrypt, encrypt, randomToken } from "../lib/crypto";
import type { IntegrationState } from "./sms";

/** Raw blob store. Encryption happens in this module, above the provider. */
export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements StorageProvider {
  readonly name = "local";
  constructor(private root: string) {}
  private file(key: string) {
    if (!/^[a-zA-Z0-9/_-]+$/.test(key) || key.includes("..")) throw new Error("Ungültiger Speicherschlüssel");
    return path.join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true, mode: 0o700 });
    await writeFile(f, data, { mode: 0o600 });
  }
  get(key: string) {
    return readFile(this.file(key));
  }
  delete(key: string) {
    return rm(this.file(key), { force: true });
  }
}

class S3Storage implements StorageProvider {
  readonly name = "s3";
  private client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? "auto",
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
  async put(key: string, data: Buffer) {
    await this.client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: data, ContentType: "application/octet-stream" }));
  }
  async get(key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return Buffer.from(await out.Body!.transformToByteArray());
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
}

let provider: StorageProvider | null = null;
function getProvider(): StorageProvider {
  if (provider) return provider;
  if (env.STORAGE_PROVIDER === "s3") {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) throw new Error("S3-Speicher ist nicht vollständig konfiguriert.");
    provider = new S3Storage();
  } else {
    provider = new LocalStorage(path.resolve(env.STORAGE_LOCAL_DIR));
  }
  return provider;
}

const key = () => Buffer.from(env.DOCUMENT_ENCRYPTION_KEY, "base64");

export async function storeEncrypted(prefix: string, data: Buffer): Promise<string> {
  const storageKey = `${prefix}/${new Date().getUTCFullYear()}/${randomToken(24)}`;
  await getProvider().put(storageKey, encrypt(data, key()));
  return storageKey;
}

export async function readDecrypted(storageKey: string): Promise<Buffer> {
  return decrypt(await getProvider().get(storageKey), key());
}

export async function deleteStored(storageKey: string) {
  await getProvider().delete(storageKey);
}

export function storageState(): IntegrationState {
  if (env.STORAGE_PROVIDER === "s3") {
    const ok = !!(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
    return { name: "Dokumentspeicher", active: ok, mode: ok ? "aktiv" : "nicht aktiv", detail: ok ? `S3 ${env.S3_ENDPOINT ?? ""} / ${env.S3_BUCKET}, AES-256-GCM` : "S3-Zugangsdaten fehlen" };
  }
  return {
    name: "Dokumentspeicher",
    active: true,
    mode: env.NODE_ENV === "production" ? "aktiv" : "Entwicklungsmodus",
    detail: `Lokales Verzeichnis ${env.STORAGE_LOCAL_DIR}, AES-256-GCM verschlüsselt`,
  };
}
