import { createHash, createHmac } from "node:crypto";

/**
 * Cloudflare R2 直传：R2 兼容 S3 API，这里用 AWS SigV4 手动签名，
 * 避免为一个上传接口引入整套 AWS SDK。
 */

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
}

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicBase = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

export function isR2Configured(): boolean {
  return r2Config() !== null;
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    ))
    .join("/");
}

export function safeFileName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(-80) || "asset";
}

export function buildObjectKey(fileName: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const nonce = Math.random().toString(36).slice(2, 8);
  return `blog/${yyyy}/${mm}/${nonce}-${safeFileName(fileName)}`;
}

function signingKey(secretAccessKey: string, dateStamp: string): Buffer {
  return hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), "auto"), "s3"),
    "aws4_request"
  );
}

/** S3 的 canonical query 只认 RFC3986，encodeURIComponent 会漏掉 !'()* */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/** 对象键对应的公开访问地址（自定义域名 / r2.dev 域名）。 */
export function publicUrlFor(key: string): string {
  const config = r2Config();
  if (!config) throw new Error("R2 尚未配置");
  return `${config.publicBase}/${encodeKey(key)}`;
}

/**
 * 签发预签名 PUT 地址，让浏览器直连 R2 上传。
 * 大文件不再经过 Serverless 函数，既绕开 Vercel 4.5MB 请求体上限，
 * 也避免把整个音频读进函数内存。
 */
export function presignR2Put(key: string, expiresInSeconds = 900): string {
  const config = r2Config();
  if (!config) throw new Error("R2 尚未配置");

  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${config.bucket}/${encodeKey(key)}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;

  // 参数名按字典序排列，直接决定最终签名是否被 R2 认可
  const queryPairs: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresInSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = queryPairs
    .map(([name, value]) => `${rfc3986(name)}=${rfc3986(value)}`)
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(config.secretAccessKey, dateStamp)
  )
    .update(stringToSign)
    .digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
