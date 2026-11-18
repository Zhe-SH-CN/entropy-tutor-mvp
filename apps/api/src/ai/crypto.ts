import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const key = () => {
  const configured = process.env.BYOK_MASTER_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(configured)) throw new Error("BYOK_MASTER_KEY must be 64 hex characters");
  return Buffer.from(configured, "hex");
};

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(payload: string): string {
  const [iv, tag, encrypted] = payload.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export const secretFingerprint = (secret: string) => createHash("sha256").update(secret).digest("hex").slice(0, 12);
