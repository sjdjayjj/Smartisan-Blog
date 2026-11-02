import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { buildObjectKey, isR2Configured, uploadToR2 } from "@/lib/r2";

const MAX_SIZE = 60 * 1024 * 1024;
const ALLOWED = [
  "image/",
  "video/",
  "audio/",
  "application/pdf",
];

/** SVG 可以内嵌脚本，上传后又被当作同源资源托管，直接拒绝而不是尝试 sanitize。 */
function isSvg(file: File): boolean {
  return file.type.toLowerCase() === "image/svg+xml" || /\.svg$/i.test(file.name || "");
}

type BodyReadResult =
  | { ok: true; body: Uint8Array<ArrayBuffer> }
  | { ok: false; reason: "too-large" | "read-error" };

/**
 * 流式读取请求体并强制字节上限：
 * 没有 Content-Length 的分块请求同样不能在内存里无限堆积。
 */
async function readBodyWithLimit(
  request: Request,
  limit: number
): Promise<BodyReadResult> {
  if (!request.body) return { ok: false, reason: "read-error" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "read-error" };
  }

  // 显式用 ArrayBuffer 构造，返回类型才能满足 BlobPart / BodyInit 的窄签名
  const body = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body };
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "没有上传权限" }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 尚未配置，可先在弹窗中粘贴外部资源链接" },
      { status: 503 }
    );
  }

  // 先用声明长度挡掉明显超限的请求，避免把整个 body 读进内存再判
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SIZE) {
    return NextResponse.json({ error: "文件超过 60MB 限制" }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const read = await readBodyWithLimit(request, MAX_SIZE);
  if (!read.ok) {
    return NextResponse.json(
      { error: read.reason === "too-large" ? "文件超过 60MB 限制" : "请求读取失败" },
      { status: read.reason === "too-large" ? 413 : 400 }
    );
  }

  let form: FormData;
  try {
    // 用 Blob 落一次类型边界（Uint8Array<ArrayBufferLike> 不在 BodyInit 的宽泛签名里）
    const blob = new Blob([read.body], { type: contentType });
    form = await new Response(blob).formData();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "文件超过 60MB 限制" }, { status: 413 });
  }
  if (isSvg(file)) {
    return NextResponse.json({ error: "不支持 SVG 文件" }, { status: 415 });
  }
  if (!ALLOWED.some((type) => file.type.startsWith(type))) {
    return NextResponse.json({ error: "不支持该文件类型" }, { status: 415 });
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const key = buildObjectKey(file.name || "asset");
    const url = await uploadToR2(key, buffer, file.type);
    return NextResponse.json({ ok: true, url, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
