import { NextResponse } from "next/server";
import { isValidSlug, loadPost } from "@/lib/github";

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

  const post = await loadPost(slug);
  if (!post) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  return NextResponse.json(
    { document: post.document },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
