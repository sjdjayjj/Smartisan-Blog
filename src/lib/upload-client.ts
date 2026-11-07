const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
const MAX_MB = MAX_UPLOAD_BYTES / 1024 / 1024;

interface PresignPayload {
  ok?: boolean;
  uploadUrl?: string;
  url?: string;
  error?: string;
  message?: string;
}

/** 把错误页/纯文本压成一行短提示，避免把整页 HTML 塞进 toast。 */
function shorten(text: string): string {
  const body = text.trim();
  if (!body) return "";
  const plain = body.startsWith("<")
    ? body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : body;
  return plain.slice(0, 160);
}

/** 服务端错误都返回 JSON；非 JSON（网关 413/504、代理错误页）也要给出可读原因。 */
async function explain(response: Response): Promise<string> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return `HTTP ${response.status}`;
  }
  try {
    const parsed = JSON.parse(text) as PresignPayload;
    const message = parsed.error ?? parsed.message;
    if (typeof message === "string" && message) return message;
  } catch {
    // 不是 JSON，继续按文本处理
  }
  const plain = shorten(text);
  return plain ? `HTTP ${response.status}：${plain}` : `HTTP ${response.status}`;
}

/**
 * 两步上传：先向本站接口要预签名 PUT 地址，再让浏览器直连 R2。
 * 文件不经过 Serverless 函数，因此不受 Vercel 4.5MB 请求体限制。
 */
export async function uploadMedia(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `文件 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 ${MAX_MB}MB 上限`
    );
  }

  let presignResponse: Response;
  try {
    presignResponse = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
    });
  } catch (error) {
    throw new Error(
      `无法连接上传接口：${error instanceof Error ? error.message : String(error)}`
    );
  }

  const presignText = await presignResponse.text();
  let presign: PresignPayload = {};
  try {
    presign = JSON.parse(presignText) as PresignPayload;
  } catch {
    throw new Error(`上传接口返回异常（HTTP ${presignResponse.status}）：${shorten(presignText)}`);
  }

  if (!presignResponse.ok || !presign.uploadUrl || !presign.url) {
    throw new Error(presign.error ?? `上传接口返回异常（HTTP ${presignResponse.status}）`);
  }

  let putResponse: Response;
  try {
    putResponse = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
  } catch (error) {
    throw new Error(
      `浏览器直连 R2 失败：${error instanceof Error ? error.message : String(error)}。` +
        "多半是桶未配置 CORS（需允许站点域名发起 PUT），或 R2 公开域名不可访问"
    );
  }

  if (!putResponse.ok) {
    throw new Error(`R2 直传失败：${await explain(putResponse)}`);
  }

  return presign.url;
}
