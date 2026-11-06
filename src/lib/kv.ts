/**
 * Cloudflare KV REST 客户端的极简封装（服务端专用）。
 *
 * AI 供应商配置与首页歌单共用这一套读写，避免维护两份几乎一样的请求逻辑。
 * Vercel 上没有 Workers binding，只能走 REST API；这里不引入任何 SDK，
 * 账号 ID 复用 `R2_ACCOUNT_ID`，命名空间与令牌复用 `CF_KV_NAMESPACE_ID` / `CF_API_TOKEN`。
 */

// 客户端误引时立刻失败：KV 令牌绝不能被带进浏览器包
if (typeof window !== "undefined") {
  throw new Error("kv 只能在服务端使用");
}

interface KvEnv {
  accountId: string;
  namespaceId: string;
  token: string;
}

export type KvErrorCode = "store_not_ready" | "kv_read_failed" | "kv_write_failed";

export class KvError extends Error {
  readonly code: KvErrorCode;

  constructor(code: KvErrorCode, message: string) {
    super(message);
    this.name = "KvError";
    this.code = code;
  }
}

export function kvEnv(): KvEnv | null {
  const accountId = (process.env.R2_ACCOUNT_ID ?? "").trim();
  const namespaceId = (process.env.CF_KV_NAMESPACE_ID ?? "").trim();
  const token = (process.env.CF_API_TOKEN ?? "").trim();
  if (!accountId || !namespaceId || !token) return null;
  return { accountId, namespaceId, token };
}

export function isKvConfigured(): boolean {
  return kvEnv() !== null;
}

function valueUrl(env: KvEnv, key: string, cacheTtlSeconds?: number): string {
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    env.accountId
  )}/storage/kv/namespaces/${encodeURIComponent(env.namespaceId)}/values/${encodeURIComponent(
    key
  )}`;
  return cacheTtlSeconds === undefined ? base : `${base}?cacheTtl=${cacheTtlSeconds}`;
}

/**
 * cacheTtl=0 用于压制 KV 边缘缓存（保存后立刻读到新值）；
 * 若网关不接受该取值（Cloudflare 对 cacheTtl 有最小值限制），退回默认缓存并留日志痕。
 */
async function getValueResponse(env: KvEnv, key: string): Promise<Response> {
  const init: RequestInit = {
    headers: { Authorization: `Bearer ${env.token}` },
    cache: "no-store",
  };
  const withTtl = await fetch(valueUrl(env, key, 0), init);
  if (withTtl.status === 400) {
    console.warn("[kv] cacheTtl=0 被拒绝，已退回默认缓存，写入后可能短时读到旧值");
    return fetch(valueUrl(env, key), init);
  }
  return withTtl;
}

/** 读取原始值；键不存在返回 null（不视为错误）。 */
export async function readKvValue(key: string): Promise<string | null> {
  const env = kvEnv();
  if (!env) throw new KvError("store_not_ready", "KV 存储未配置");
  const response = await getValueResponse(env, key);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new KvError("kv_read_failed", `KV 读取失败（HTTP ${response.status}）`);
  }
  return response.text();
}

/** 覆盖写入整值。 */
export async function writeKvValue(key: string, value: string): Promise<void> {
  const env = kvEnv();
  if (!env) throw new KvError("store_not_ready", "KV 存储未配置");
  const response = await fetch(valueUrl(env, key), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: value,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new KvError("kv_write_failed", `KV 写入失败（HTTP ${response.status}）`);
  }
}

/** 删除键；404 视为已删除，保持幂等。 */
export async function deleteKvValue(key: string): Promise<void> {
  const env = kvEnv();
  if (!env) throw new KvError("store_not_ready", "KV 存储未配置");
  const response = await fetch(valueUrl(env, key), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${env.token}` },
    cache: "no-store",
  });
  if (!response.ok && response.status !== 404) {
    throw new KvError("kv_write_failed", `KV 删除失败（HTTP ${response.status}）`);
  }
}
