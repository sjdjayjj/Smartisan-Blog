import { promises as fs } from "node:fs";
import path from "node:path";

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

interface KvEnv {
  accountId: string;
  namespaceId: string;
  token: string;
}

interface EncryptedEnvelope {
  v: 1;
  alg: "AES-256-GCM";
  iv: string;
  data: string;
}

function kvEnv(): KvEnv | null {
  // 账号 ID 复用现有 R2_ACCOUNT_ID，避免再加一个变量
  const accountId = (process.env.R2_ACCOUNT_ID ?? "").trim();
  const namespaceId = (process.env.CF_KV_NAMESPACE_ID ?? "").trim();
  const token = (process.env.CF_API_TOKEN ?? "").trim();
  if (!accountId || !namespaceId || !token) return null;
  return { accountId, namespaceId, token };
}

/** KV 两变量（外加复用的账号 ID 与加密密钥）是否齐全，用于生产就绪判断。 */
export function isAiConfigStoreReady(): boolean {
  return Boolean(kvEnv() && process.env.AUTH_SECRET);
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

function kvValueUrl(env: KvEnv, cacheTtlSeconds?: number): string {
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    env.accountId
  )}/storage/kv/namespaces/${encodeURIComponent(env.namespaceId)}/values/${encodeURIComponent(
    AI_CONFIG_KEY
  )}`;
  return cacheTtlSeconds === undefined ? base : `${base}?cacheTtl=${cacheTtlSeconds}`;
}

async function kvRead(env: KvEnv): Promise<Response> {
  const init: RequestInit = {
    headers: { Authorization: `Bearer ${env.token}` },
    cache: "no-store",
  };
  // cacheTtl=0 用于压制 KV 边缘缓存（保存后立刻读到新值）；
  // 若网关不接受该取值（Cloudflare 对 cacheTtl 有最小值限制），退回默认缓存并留日志痕。
  const withTtl = await fetch(kvValueUrl(env, 0), init);
  if (withTtl.status === 400) {
    console.warn("[ai-config-store] cacheTtl=0 被拒绝，已退回默认缓存，写入后可能短时读到旧值");
    return fetch(kvValueUrl(env), init);
  }
  return withTtl;
}

async function readRaw(): Promise<string | null> {
  const mode = aiConfigStorageMode();

  if (mode === "kv") {
    const env = kvEnv();
    if (!env) throw new AiConfigError("store_not_ready", "AI 配置存储未配置");
    const response = await kvRead(env);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new AiConfigError("kv_read_failed", `KV 读取失败（HTTP ${response.status}）`);
    }
    return response.text();
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
    const env = kvEnv();
    if (!env) throw new AiConfigError("store_not_ready", "AI 配置存储未配置");
    const response = await fetch(kvValueUrl(env), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env.token}`,
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: raw,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new AiConfigError("kv_write_failed", `KV 写入失败（HTTP ${response.status}）`);
    }
    return;
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
    const env = kvEnv();
    if (!env) throw new AiConfigError("store_not_ready", "AI 配置存储未配置");
    const response = await fetch(kvValueUrl(env), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.token}` },
      cache: "no-store",
    });
    // 404 视为已删除，保持幂等
    if (!response.ok && response.status !== 404) {
      throw new AiConfigError("kv_write_failed", `KV 删除失败（HTTP ${response.status}）`);
    }
    return;
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
