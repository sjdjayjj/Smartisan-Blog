import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSession, isAdmin } from "@/lib/auth";
import { deletePost, isValidSlug, savePost } from "@/lib/github";
import { categoryMeta, type CategoryKey } from "@/lib/site";

interface PostPayload {
  slug?: string;
  title?: string;
  date?: string;
  category?: string;
  summary?: string;
  body?: string;
}

function forbidden() {
  return NextResponse.json({ error: "没有编辑权限" }, { status: 401 });
}

/**
 * 数据源异常时不回传原始 error.message（可能含 token 失效细节或内部路径），
 * 只给用户固定文案 + requestId，完整信息留在服务端日志供排查。
 */
function serverError(scope: string, error: unknown) {
  const requestId = randomUUID();
  console.error(`[api/posts] ${scope} requestId=${requestId}`, error);
  return NextResponse.json(
    { error: "服务暂时不可用，请稍后重试", requestId },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!isAdmin(user)) return forbidden();

  let payload: PostPayload;
  try {
    payload = (await request.json()) as PostPayload;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const slug = (payload.slug ?? "").trim();
  const title = (payload.title ?? "").trim();
  const summary = (payload.summary ?? "").trim();
  const body = payload.body ?? "";
  const category =
    payload.category && payload.category in categoryMeta
      ? (payload.category as CategoryKey)
      : "thinking";

  if (!title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: "文件名只能包含字母、数字与短横线（如 my-new-post）" },
      { status: 400 }
    );
  }
  if (!body.trim()) return NextResponse.json({ error: "正文不能为空" }, { status: 400 });

  try {
    await savePost({
      slug,
      title,
      summary,
      category,
      date: payload.date ?? "",
      body,
    });
    revalidateTag("posts", "max");
    revalidatePath("/");
    revalidatePath("/account");
    revalidatePath(`/account/editor?slug=${slug}`);
    return NextResponse.json({ ok: true, slug });
  } catch (error) {
    return serverError("save", error);
  }
}

export async function DELETE(request: Request) {
  const user = await getSession();
  if (!isAdmin(user)) return forbidden();

  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 });
  }

  try {
    await deletePost(slug);
    revalidateTag("posts", "max");
    revalidatePath("/");
    revalidatePath("/account");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("delete", error);
  }
}
