import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { buildObjectKey, isR2Configured, presignR2Put, publicUrlFor } from "@/lib/r2";

const MAX_SIZE = 60 * 1024 * 1024;
const ALLOWED = ["image/", "video/", "audio/", "application/pdf"];
const PRESIGN_TTL_SECONDS = 15 * 60;

/** SVG 可以内嵌脚本，上传后又被当作同源资源托管，直接拒绝而不是尝试 sanitize。 */
function isSvg(name: string, type: string): boolean {
  return type.toLowerCase() === "image/svg+xml" || /\.svg$/i.test(name);
}

/**
 * 只签发预签名 PUT 地址，文件本体由浏览器直连 R2。
 * 之前在这里中转整个文件，超过 Vercel 4.5MB 的函数请求体上限时，
 * 请求根本到不了路由，返回的是平台的非 JSON 错误页，前端只能猜成「网络问题」。
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "没有上传权限" }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 尚未配置，可先粘贴外部资源链接" },
      { status: 503 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  let payload: { name?: unknown; type?: unknown; size?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 200) : "";
  const type = typeof payload.type === "string" ? payload.type.toLowerCase() : "";
  const size = typeof payload.size === "number" ? payload.size : Number.NaN;

  if (!name) {
    return NextResponse.json({ error: "缺少文件名" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "缺少文件大小" }, { status: 400 });
  }
  if (size > MAX_SIZE) {
    return NextResponse.json({ error: "文件超过 60MB 限制" }, { status: 413 });
  }
  if (isSvg(name, type || "application/octet-stream")) {
    return NextResponse.json({ error: "不支持 SVG 文件" }, { status: 415 });
  }
  if (!ALLOWED.some((prefix) => type.startsWith(prefix))) {
    return NextResponse.json({ error: "不支持该文件类型" }, { status: 415 });
  }

  try {
    const key = buildObjectKey(name);
    const uploadUrl = presignR2Put(key, PRESIGN_TTL_SECONDS);
    return NextResponse.json({
      ok: true,
      key,
      uploadUrl,
      url: publicUrlFor(key),
      expiresIn: PRESIGN_TTL_SECONDS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "预签名失败";
    console.error("[api/upload] 签发预签名地址失败", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
