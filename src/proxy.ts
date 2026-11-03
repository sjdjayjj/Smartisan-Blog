import { NextResponse, type NextRequest } from "next/server";
import { isValidSlug, probePost, type SourceState } from "@/lib/post-source";

/**
 * /post/[slug] 的 404 前置校验。
 *
 * 站点开启了 Cache Components（PPR），页面响应会先流出静态 App Shell、
 * 随后才流式渲染依赖 params 的正文。此时在 page 里调用 notFound() 只能得到
 * “200 + 流式 404 页面”（soft 404），无法满足爬虫要求的真实状态码。
 * 官方推荐在 Proxy 里先行判断 slug 是否存在，缺失时改写到不存在的路由，
 * 由 Next 的 404 管线返回带样式的 404 页面。
 *
 * 存在性探测复用 @/lib/post-source（与页面读取同一解析器，后缀规则一致）。
 * 内容源异常时返回 503（而不是放行成 200 空白页，也不是误判成 404）。
 */

const MISSING_PATH = "/__post_not_found__";

/** 与正文内容 60s 的缓存周期保持一致，避免每个请求都打一次 GitHub API。 */
const TTL = 60_000;
/** 缓存容量上限：防止随机 slug 刷爆内存与 GitHub API 配额。 */
const CACHE_MAX = 500;

const presence = new Map<string, { state: "ok" | "missing"; expires: number }>();

function readPresence(slug: string): "ok" | "missing" | null {
  const cached = presence.get(slug);
  if (!cached) return null;
  if (cached.expires <= Date.now()) {
    presence.delete(slug);
    return null;
  }
  // Map 按插入顺序迭代：命中后重新插入，实现 LRU 刷新
  presence.delete(slug);
  presence.set(slug, cached);
  return cached.state;
}

function writePresence(slug: string, state: "ok" | "missing") {
  presence.delete(slug);
  presence.set(slug, { state, expires: Date.now() + TTL });
  while (presence.size > CACHE_MAX) {
    const oldest = presence.keys().next().value;
    if (oldest === undefined) break;
    presence.delete(oldest);
  }
}

async function postState(slug: string): Promise<SourceState> {
  const cached = readPresence(slug);
  if (cached) return cached;
  try {
    const state = await probePost(slug);
    // 只缓存确定结果；内容源异常不缓存，恢复后可立即生效
    if (state === "ok" || state === "missing") writePresence(slug, state);
    return state;
  } catch (error) {
    console.error("[proxy] 文章存在性校验失败：", error);
    return "unavailable";
  }
}

const UNAVAILABLE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>内容暂时不可用</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f1ec;color:#2b2b2b;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"><div style="max-width:32rem;padding:2rem;text-align:center"><p style="font:600 12px/1.6 ui-monospace,monospace;letter-spacing:.16em;color:#9a6b2f">CONTENT SOURCE UNAVAILABLE</p><h1 style="font:700 22px/1.4 Georgia,'Songti SC',serif;margin:.75rem 0">内容源暂时不可用</h1><p style="font-size:14px;line-height:1.9;color:#666">文章仓库当前无法读取（网络或凭据异常），这不是「文章不存在」。稍后重试即可。</p><p style="margin-top:1.5rem"><a href="/" style="color:#a32b2b;text-decoration:none;font-size:13px">← 返回首页</a></p></div></body></html>`;

function unavailableResponse(): NextResponse {
  return new NextResponse(UNAVAILABLE_HTML, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "60",
    },
  });
}

export async function proxy(request: NextRequest) {
  const slug = request.nextUrl.pathname.replace(/^\/post\/?/, "");
  if (!isValidSlug(slug)) {
    return NextResponse.rewrite(new URL(MISSING_PATH, request.url));
  }

  const state = await postState(slug);
  if (state === "missing") {
    return NextResponse.rewrite(new URL(MISSING_PATH, request.url));
  }
  if (state === "unavailable") {
    return unavailableResponse();
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/post/:path*",
};
