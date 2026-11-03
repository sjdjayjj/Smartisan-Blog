import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

/**
 * /post/[slug] 的 404 前置校验。
 *
 * 站点开启了 Cache Components（PPR），页面响应会先流出静态 App Shell、
 * 随后才流式渲染依赖 params 的正文。此时在 page 里调用 notFound() 只能得到
 * “200 + 流式 404 页面”（soft 404），无法满足爬虫要求的真实状态码。
 * 官方推荐在 Proxy 里先行判断 slug 是否存在，缺失时改写到不存在的路由，
 * 由 Next 的 404 管线返回带样式的 404 页面。
 */

const POSTS_DIR = process.env.BLOG_POSTS_DIR?.trim() || "src/content/posts";
const SLUG_PATTERN = /^[a-z0-9_][a-z0-9_-]{0,80}$/i;
const MISSING_PATH = "/__post_not_found__";

/** 与正文内容 60s 的缓存周期保持一致，避免每个请求都打一次 GitHub API。 */
const TTL = 60_000;
const presence = new Map<string, { exists: boolean; expires: number }>();

function repoConfig(): { repo: string; token: string; branch: string } | null {
  const repo = process.env.BLOG_REPO?.trim();
  const token = process.env.BLOG_GITHUB_TOKEN?.trim();
  if (!repo || !token) return null;
  return { repo, token, branch: process.env.BLOG_BRANCH?.trim() || "main" };
}

async function existsRemote(slug: string): Promise<boolean> {
  const config = repoConfig();
  if (!config) throw new Error("GitHub 内容源未配置");
  const name = encodeURIComponent(`${slug}.mdoc`);
  const dir = POSTS_DIR.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `https://api.github.com/repos/${config.repo}/contents/${dir}/${name}?ref=${encodeURIComponent(config.branch)}`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "smartisan-blog",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(5_000),
    }
  );
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`GitHub 内容校验失败：${response.status}`);
  return true;
}

async function existsLocal(slug: string): Promise<boolean> {
  try {
    await fs.access(
      /*turbopackIgnore: true*/ path.join(process.cwd(), POSTS_DIR, `${slug}.mdoc`)
    );
    return true;
  } catch {
    return false;
  }
}

/** 网络异常时放行，交给页面自身的降级逻辑，避免内容源故障导致全站文章 404。 */
async function postExists(slug: string): Promise<boolean> {
  const cached = presence.get(slug);
  if (cached && cached.expires > Date.now()) return cached.exists;
  try {
    const exists = repoConfig() ? await existsRemote(slug) : await existsLocal(slug);
    presence.set(slug, { exists, expires: Date.now() + TTL });
    return exists;
  } catch (error) {
    console.error("[proxy] 文章存在性校验失败，放行：", error);
    return true;
  }
}

export async function proxy(request: NextRequest) {
  const slug = request.nextUrl.pathname.replace(/^\/post\/?/, "");
  if (!SLUG_PATTERN.test(slug)) {
    return NextResponse.rewrite(new URL(MISSING_PATH, request.url));
  }
  if (!(await postExists(slug))) {
    return NextResponse.rewrite(new URL(MISSING_PATH, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/post/:path*",
};
