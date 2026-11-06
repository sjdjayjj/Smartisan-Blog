import { promises as fs } from "node:fs";
import path from "node:path";
import {
  KvError,
  deleteKvValue,
  isKvConfigured,
  readKvValue,
  writeKvValue,
} from "@/lib/kv";

/**
 * AI 供应商配置存储：单条 KV 记录 + AES-256-GCM 密文。
 *
 * 设计约束：
 * - 纯数据层，不做权限判断；鉴权由 Route Handler / 页面负责。
 * - 只能在服务端使用，禁止被客户端组件 import。
 * - KV 访问走 Cloudflare REST API（Vercel 上没有 Workers binding），不引入 SDK。
 * - 加密主密钥从 AUTH_SECRET 经 HKDF 派生，不新增环境变量。
 */

// 客户端误引时立刻失败，避免把 node:fs / 密钥逻辑打进浏览器包
if (typeof window !== "undefined") {
  throw new Error("ai-config-store 只能在服务端使用");
}

export const AI_CONFIG_KEY = "ai-config:v1";

const LOCAL_CONFIG_FILE = ".ai-config.local.json";
const HKDF_SALT = "smartisan-blog/ai-config/v1";
const HKDF_INFO = "ai-config-aes-256-gcm";

export interface AiProvider {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface AiConfig {
  version: 1;
  providers: AiProvider[];
  defaultProviderId: string;
  updatedAt: string;
}

export interface MaskedAiProvider extends Omit<AiProvider, "apiKey"> {
  apiKeyMasked: string;
}

export interface MaskedAiConfig {
  version: 1;
  providers: MaskedAiProvider[];
  defaultProviderId: string;
  updatedAt: string;
}

export type AiConfigStorageMode = "kv" | "local" | "none";

export type AiConfigErrorCode =
  | "store_not_ready"
  | "kv_read_failed"
  | "kv_write_failed"
  | "encryption_key_missing"
  | "encrypt_failed"
  | "config_corrupt"
  | "local_io_failed";

export class AiConfigError extends Error {
  readonly code: AiConfigErrorCode;

  constructor(code: AiConfigErrorCode, message: string) {
    super(message);
    this.name = "AiConfigError";
    this.code = code;
  }
}

interface EncryptedEnvelope {
  v: 1;
  alg: "AES-256-GCM";
  iv: string;
  data: string;
}

/** KV 两变量（外加复用的账号 ID 与加密密钥）是否齐全，用于生产就绪判断。 */
export function isAiConfigStoreReady(): boolean {
  return Boolean(isKvConfigured() && process.env.AUTH_SECRET);
}

/** dev 无 KV 时允许回退到本地临时文件；生产环境绝不回退。 */
export function aiConfigStorageMode(): AiConfigStorageMode {
  if (isAiConfigStoreReady()) return "kv";
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_SECRET) return "local";
  return "none";
}

/** 入口是否可展示：KV 就绪，或本地开发兜底可用。 */
export function isAiConfigAvailable(): boolean {
  return aiConfigStorageMode() !== "none";
}

/* ------------------------------ 加解密 ------------------------------ */

function rawBytes(value: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(value);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string): ArrayBuffer {
  const buf = Buffer.from(value, "base64url");
  const buffer = new ArrayBuffer(buf.byteLength);
  new Uint8Array(buffer).set(buf);
  return buffer;
}

async function deriveEncryptionKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) {
    throw new AiConfigError("encryption_key_missing", "缺少 AUTH_SECRET，无法派生 AI 配置加密密钥");
  }
  const ikm = await crypto.subtle.importKey("raw", rawBytes(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: rawBytes(HKDF_SALT),
      info: rawBytes(HKDF_INFO),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptConfig(config: AiConfig): Promise<string> {
  try {
    const key = await deriveEncryptionKey();
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      rawBytes(JSON.stringify(config))
    );
    const envelope: EncryptedEnvelope = {
      v: 1,
      alg: "AES-256-GCM",
      iv: toBase64Url(iv),
      data: toBase64Url(new Uint8Array(ciphertext)),
    };
    return JSON.stringify(envelope);
  } catch (error) {
    if (error instanceof AiConfigError) throw error;
    throw new AiConfigError("encrypt_failed", "AI 配置加密失败");
  }
}

async function decryptConfig(raw: string): Promise<AiConfig> {
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(raw) as EncryptedEnvelope;
  } catch {
    throw new AiConfigError("config_corrupt", "AI 配置密文无法解析");
  }
  if (!envelope || envelope.v !== 1 || envelope.alg !== "AES-256-GCM" || !envelope.iv || !envelope.data) {
    throw new AiConfigError("config_corrupt", "AI 配置密文格式不正确");
  }

  const key = await deriveEncryptionKey();
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(envelope.iv) },
      key,
      fromBase64Url(envelope.data)
    );
  } catch {
    // 常见原因：AUTH_SECRET 轮换后旧密文无法解开
    throw new AiConfigError("config_corrupt", "AI 配置解密失败，可能是 AUTH_SECRET 已变更");
  }

  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as AiConfig;
  if (!Array.isArray(parsed?.providers) || parsed.providers.length === 0) {
    throw new AiConfigError("config_corrupt", "AI 配置内容为空或格式不正确");
  }
  return parsed;
}

/* ------------------------------ 存储读写 ------------------------------ */

function localConfigPath(): string {
  return path.join(process.cwd(), LOCAL_CONFIG_FILE);
}

/**
 * 把通用 KV 层抛出的错误映射回 AI 配置的错误码，保持接口契约不变。
 * KvError 的 code 子集与 AiConfigErrorCode 完全一致。
 */
function mapKvError(error: unknown, fallback: AiConfigErrorCode): never {
  if (error instanceof KvError) {
    throw new AiConfigError(error.code, error.message);
  }
  if (error instanceof AiConfigError) throw error;
  throw new AiConfigError(fallback, "AI 配置存储访问失败");
}

async function readRaw(): Promise<string | null> {
  const mode = aiConfigStorageMode();

  if (mode === "kv") {
    try {
      return await readKvValue(AI_CONFIG_KEY);
    } catch (error) {
      mapKvError(error, "kv_read_failed");
    }
  }

  if (mode === "local") {
    try {
      return await fs.readFile(localConfigPath(), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw new AiConfigError("local_io_failed", "本地 AI 配置文件读取失败");
    }
  }

  throw new AiConfigError("store_not_ready", "AI 配置存储未配置");
}

async function writeRaw(raw: string): Promise<void> {
  const mode = aiConfigStorageMode();

  if (mode === "kv") {
    try {
      await writeKvValue(AI_CONFIG_KEY, raw);
      return;
    } catch (error) {
      mapKvError(error, "kv_write_failed");
    }
  }

  if (mode === "local") {
    try {
      await fs.writeFile(localConfigPath(), raw, { encoding: "utf8", mode: 0o600 });
    } catch {
      throw new AiConfigError("local_io_failed", "本地 AI 配置文件写入失败");
    }
    return;
  }

  throw new AiConfigError("store_not_ready", "AI 配置存储未配置");
}

/** 读取完整配置（含明文 Key），仅限服务端内部使用（如转发模型请求）。 */
export async function readAiConfig(): Promise<AiConfig | null> {
  const raw = await readRaw();
  if (!raw) return null;
  return decryptConfig(raw);
}

/** 保存整份配置，调用方负责字段校验与 Key 合并。 */
export async function writeAiConfig(config: AiConfig): Promise<void> {
  await writeRaw(await encryptConfig(config));
}

/** 清除配置。 */
export async function deleteAiConfig(): Promise<void> {
  const mode = aiConfigStorageMode();

  if (mode === "kv") {
    try {
      await deleteKvValue(AI_CONFIG_KEY);
      return;
    } catch (error) {
      mapKvError(error, "kv_write_failed");
    }
  }

  if (mode === "local") {
    try {
      await fs.rm(localConfigPath(), { force: true });
    } catch {
      throw new AiConfigError("local_io_failed", "本地 AI 配置文件删除失败");
    }
    return;
  }

  throw new AiConfigError("store_not_ready", "AI 配置存储未配置");
}

/* ------------------------------ 脱敏 ------------------------------ */

/** 展示用掩码：形如 sk-****abcd，明文不出服务端。 */
export function maskApiKey(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) return "";
  if (key.length <= 8) return "****";
  const tail = key.slice(-4);
  return key.startsWith("sk-") ? `sk-****${tail}` : `****${tail}`;
}

export async function readMaskedAiConfig(): Promise<MaskedAiConfig | null> {
  const config = await readAiConfig();
  if (!config) return null;
  return {
    version: 1,
    defaultProviderId: config.defaultProviderId,
    updatedAt: config.updatedAt,
    providers: config.providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKeyMasked: maskApiKey(provider.apiKey),
    })),
  };
}
