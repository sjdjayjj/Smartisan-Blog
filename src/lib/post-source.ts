import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 文章内容源的单一事实源：仓库坐标、目录拼装、文件后缀规则与存在性探测。
 *
 * 这里刻意不引入任何仅服务端可用的业务依赖（Markdoc、site 配置、server-only），
 * 以便 src/proxy.ts 与 src/lib/github.ts 共用同一套解析逻辑，不再各写一份。
 *
 * 解析规则：依次探测 `<slug>.mdoc` 与 `<slug>.md`，命中第一个即停止。
 */

export const POSTS_DIR = process.env.BLOG_POSTS_DIR?.trim() || "src/content/posts";

/** 与既有的路由校验保持一致：允许前导下划线，便于按需加载仓库自带的 _example。 */
export const SLUG_PATTERN = /^[a-z0-9_][a-z0-9_-]{0,80}$/i;

export const POST_EXTENSIONS = [".mdoc", ".md"] as const;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** 按优先级返回该 slug 可能对应的全部文件名。 */
export function postFileNames(slug: string): string[] {
  return POST_EXTENSIONS.map((extension) => `${slug}${extension}`);
}

export function isPostFileName(name: string): boolean {
  return /\.(md|mdoc)$/i.test(name);
}

export function postSlugFromFileName(name: string): string {
  return name.replace(/\.(md|mdoc)$/i, "");
}

export interface RepoConfig {
  repo: string;
  token: string;
  branch: string;
}

export function repoConfig(): RepoConfig | null {
  const repo = process.env.BLOG_REPO?.trim();
  const token = process.env.BLOG_GITHUB_TOKEN?.trim();
  if (!repo || !token) return null;
  return { repo, token, branch: process.env.BLOG_BRANCH?.trim() || "main" };
}

/** 逐段编码目录，避免 BLOG_POSTS_DIR 含空格或特殊字符时拼出非法 URL。 */
export function encodeRepoPath(dir: string): string {
  return dir
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "smartisan-blog",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** 内容源健康状态：ok=可用，missing=确定不存在，unavailable=内容源本身异常。 */
export type SourceState = "ok" | "missing" | "unavailable";

export type PostSourceResult =
  | { status: "ok"; raw: string; fileName: string }
  | { status: "missing" }
  | { status: "unavailable" };

const REMOTE_TIMEOUT_MS = 5_000;
/** 目录健康检查的缓存周期，与正文 60s 的缓存保持一致。 */
const DIR_TTL_MS = 60_000;

let dirCache: { state: SourceState; expires: number } | null = null;

async function remoteFetch(
  url: string,
  token: string,
  init?: { revalidate?: number }
): Promise<Response> {
  return fetch(url, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    // 目录/文件读取沿用 Next 的 fetch 缓存；探测路径不传，避免 proxy 侧依赖缓存语义
    ...(init?.revalidate === undefined
      ? {}
      : { next: { revalidate: init.revalidate, tags: ["posts"] } }),
  } as RequestInit & { next?: { revalidate: number; tags: string[] } });
}

/**
 * 目录是否存在。目录 404 属于配置错误（不是「文章不存在」），
 * 必须按内容源异常处理，否则会把全站文章误判成 404。
 */
async function remoteDirState(config: RepoConfig): Promise<SourceState> {
  if (dirCache && dirCache.expires > Date.now()) return dirCache.state;
  let state: SourceState;
  try {
    const response = await remoteFetch(
      `https://api.github.com/repos/${config.repo}/contents/${encodeRepoPath(POSTS_DIR)}?ref=${encodeURIComponent(config.branch)}`,
      config.token,
      { revalidate: 60 }
    );
    if (response.ok) state = "ok";
    else if (response.status === 401 || response.status === 403 || response.status === 404 || response.status >= 500) {
      state = "unavailable";
    } else {
      state = "unavailable";
    }
  } catch {
    state = "unavailable";
  }
  dirCache = { state, expires: Date.now() + DIR_TTL_MS };
  return state;
}

/** 本地模式的目录检查：目录缺失视为配置错误（内容源异常），而不是「没有文章」。 */
async function localDirState(): Promise<SourceState> {
  try {
    const stat = await fs.stat(path.join(/*turbopackIgnore: true*/ process.cwd(), POSTS_DIR));
    return stat.isDirectory() ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
}

async function localExists(name: string): Promise<boolean> {
  try {
    await fs.access(path.join(/*turbopackIgnore: true*/ process.cwd(), POSTS_DIR, name));
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return false;
    throw error;
  }
}

/**
 * 探测某篇文章是否存在。proxy 与页面共用它，保证两边判断不会漂移。
 * 网络/鉴权/目录异常一律返回 unavailable，由调用方决定降级表现。
 */
export async function probePost(slug: string): Promise<SourceState> {
  if (!isValidSlug(slug)) return "missing";

  const config = repoConfig();
  if (!config) {
    if ((await localDirState()) !== "ok") return "unavailable";
    for (const name of postFileNames(slug)) {
      try {
        if (await localExists(name)) return "ok";
      } catch {
        return "unavailable";
      }
    }
    return "missing";
  }

  const dirState = await remoteDirState(config);
  if (dirState !== "ok") return "unavailable";

  for (const name of postFileNames(slug)) {
    let response: Response;
    try {
      response = await remoteFetch(
        `https://api.github.com/repos/${config.repo}/contents/${encodeRepoPath(POSTS_DIR)}/${encodeURIComponent(name)}?ref=${encodeURIComponent(config.branch)}`,
        config.token
      );
    } catch {
      return "unavailable";
    }
    if (response.status === 404) continue;
    if (!response.ok) return "unavailable";
    return "ok";
  }
  return "missing";
}

/** 读取单篇原文：区分「确实不存在」与「内容源不可用」，不再把两者压成 null。 */
export async function readPostSource(slug: string): Promise<PostSourceResult> {
  if (!isValidSlug(slug)) return { status: "missing" };

  const config = repoConfig();
  if (!config) {
    if ((await localDirState()) !== "ok") return { status: "unavailable" };
    for (const name of postFileNames(slug)) {
      try {
        const raw = await fs.readFile(
          path.join(/*turbopackIgnore: true*/ process.cwd(), POSTS_DIR, name),
          "utf8"
        );
        return { status: "ok", raw, fileName: name };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT") continue;
        return { status: "unavailable" };
      }
    }
    return { status: "missing" };
  }

  const dirState = await remoteDirState(config);
  if (dirState !== "ok") return { status: "unavailable" };

  for (const name of postFileNames(slug)) {
    let response: Response;
    try {
      response = await remoteFetch(
        `https://api.github.com/repos/${config.repo}/contents/${encodeRepoPath(POSTS_DIR)}/${encodeURIComponent(name)}?ref=${encodeURIComponent(config.branch)}`,
        config.token,
        { revalidate: 60 }
      );
    } catch {
      return { status: "unavailable" };
    }
    if (response.status === 404) continue;
    if (!response.ok) return { status: "unavailable" };
    const data = (await response.json()) as { content?: string };
    if (!data.content) return { status: "unavailable" };
    return {
      status: "ok",
      raw: Buffer.from(data.content, "base64").toString("utf8"),
      fileName: name,
    };
  }
  return { status: "missing" };
}
