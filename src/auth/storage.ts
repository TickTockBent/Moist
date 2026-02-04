import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { TokenData } from "../types.js";

const MOIST_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".moist",
);
const TOKENS_PATH = path.join(MOIST_DIR, "tokens.json");

// Simple encryption using a machine-specific key derived from hostname + username
function getDerivedKey(): Buffer {
  const material = `moist-${process.env.USER || process.env.USERNAME || "default"}-${require("os").hostname()}`;
  return crypto.scryptSync(material, "moist-salt", 32);
}

function encrypt(data: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(data: string): string {
  const key = getDerivedKey();
  const [ivHex, encrypted] = data.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function ensureMoistDir(): void {
  if (!fs.existsSync(MOIST_DIR)) {
    fs.mkdirSync(MOIST_DIR, { recursive: true, mode: 0o700 });
  }
}

export function saveTokens(tokens: TokenData): void {
  ensureMoistDir();
  const encrypted = encrypt(JSON.stringify(tokens));
  fs.writeFileSync(TOKENS_PATH, encrypted, { mode: 0o600 });
}

export function loadTokens(): TokenData | null {
  if (!fs.existsSync(TOKENS_PATH)) {
    return null;
  }
  try {
    const encrypted = fs.readFileSync(TOKENS_PATH, "utf8");
    const decrypted = decrypt(encrypted);
    return JSON.parse(decrypted) as TokenData;
  } catch {
    console.error("[moist] Failed to load tokens, may need to re-authenticate");
    return null;
  }
}

export function clearTokens(): void {
  if (fs.existsSync(TOKENS_PATH)) {
    fs.unlinkSync(TOKENS_PATH);
  }
}
