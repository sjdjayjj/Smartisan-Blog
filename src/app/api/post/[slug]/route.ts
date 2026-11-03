import { NextResponse } from "next/server";
import { isValidSlug, loadPostWithStatus } from "@/lib/github";

/**
 * 单篇正文按需加载：首页列表只携带摘要，弹窗打开时才取 Markdoc AST。
 * 只返回渲染所需的最小结构，不泄露草稿字段。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 });
  }

  const result = await loadPostWithStatus(slug);
  if (result.status === "not_found") {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  if (result.status === "unavailable") {
    // 与「文章不存在」区分：内容源故障时返回 5xx，避免客户端把降级当 404
    return NextResponse.json(
      { error: "内容源暂时不可用", degraded: true },
      { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { document: result.post.document },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
