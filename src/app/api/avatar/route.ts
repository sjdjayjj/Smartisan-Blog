import { NextResponse } from "next/server";

/** 仅代理 GitHub 头像域名，避免变成开放代理。 */
const ALLOWED_HOSTS = new Set([
  "avatars.githubusercontent.com",
  "github.com",
  "camo.githubusercontent.com",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("u");
  const size = Math.min(Math.max(Number(url.searchParams.get("s")) || 160, 24), 460);

  if (!raw) return NextResponse.json({ error: "缺少头像地址" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "头像地址无效" }, { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "不允许的头像来源" }, { status: 403 });
  }

  target.searchParams.set("s", String(size));

  try {
    const response = await fetch(target, {
      headers: { "User-Agent": "smartisan-blog" },
      next: { revalidate: 86400 },
    });
    if (!response.ok || !response.body) {
      return NextResponse.json({ error: "头像读取失败" }, { status: 502 });
    }
    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "头像读取失败" }, { status: 502 });
  }
}
