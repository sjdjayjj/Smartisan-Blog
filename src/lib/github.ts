import { promises as fs } from "node:fs";
import path from "node:path";
import Markdoc from "@markdoc/markdoc";
import { categoryMeta, type CategoryKey } from "@/lib/site";
import { POSTS_DIR, isValidSlug, repoConfig, readPostSource } from "@/lib/post-source";

/**
 * 文章数据源：
 * - 配置了 BLOG_REPO + BLOG_GITHUB_TOKEN 时，从 GitHub 仓库读取并以 commit 方式回写；
 * - 否则退回本地文件系统（仅开发环境可写）。
 *
 * 仓库坐标、目录拼装与 `.mdoc` / `.md` 后缀规则统一由 @/lib/post-source 提供，
 * 与 src/proxy.ts 共用，避免两套解析逻辑漂移。
 */

export { POSTS_DIR, isValidSlug };

export interface PostEntry {
  slug: string;
  title: string;
  date: string;
  category: CategoryKey;
  summary: string;
  readTime: number;
  document: unknown;
}

export interface PostDraft {
  slug: string;
  title: string;
  date: string;
  category: CategoryKey;
  summary: string;
  body: string;
}

export function githubReady(): boolean {
  return repoConfig() !== null;
}

function githubHeaders(): HeadersInit {
  const config = repoConfig();
  return {
    Authorization: `Bearer ${config?.token ?? ""}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "smartisan-blog",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function github(
  endpoint: string,
  init?: RequestInit & { revalidate?: number }
): Promise<Response> {
  const config = repoConfig();
  if (!config) throw new Error("GitHub 内容源未配置");
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...init,
    headers: { ...githubHeaders(), ...(init?.headers ?? {}) },
    next: init?.revalidate === undefined ? undefined : { revalidate: init.revalidate, tags: ["posts"] },
  } as RequestInit & { next?: { revalidate: number; tags: string[] } });
  return response;
}

/* ------------------------------- frontmatter ------------------------------ */

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

export function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    data[pair[1]] = unquote(pair[2]);
  }
  return { data, body: raw.slice(match[0].length) };
}

export function quote(value: string): string {
  if (/[:#\-{}[\]&*!|>'"%@`]/.test(value) || value !== value.trim()) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

export function serializePost(draft: PostDraft): string {
  const frontmatter = [
    "---",
    `title: ${quote(draft.title)}`,
    `date: '${draft.date}'`,
    `category: ${draft.category}`,
    `summary: ${quote(draft.summary)}`,
    "---",
    "",
  ].join("\n");
  return `${frontmatter}${draft.body.replace(/^\n+/, "")}\n`;
}

/* --------------------------------- helpers -------------------------------- */

export function slugFromTitle(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  if (ascii.length >= 2) return ascii.slice(0, 60);
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 12);
  return `post-${stamp}`;
}

function normalizeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/** 把 Markdoc 正文转换成可序列化的 AST、纯文本与顶层段落。 */
export function parseContentBody(body: string): {
  document: unknown;
  plain: string;
  paragraphs: string[];
  readTime: number;
} {
  const node = Markdoc.parse(body);
  // Markdoc Node 是类实例，JSON 往返后得到可跨 RSC 边界的纯对象
  const document: unknown = JSON.parse(JSON.stringify(node.children ?? []));
  const plain = extractText(document);
  return {
    document,
    plain,
    paragraphs: extractParagraphs(document),
    readTime: Math.max(2, Math.round(plain.length / 400)),
  };
}

function toDocument(body: string): { document: unknown; readTime: number } {
  const { document, readTime } = parseContentBody(body);
  return { document, readTime };
}

function extractText(nodes: unknown): string {
  if (!Array.isArray(nodes)) return "";
  let text = "";
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const value = node as {
      text?: unknown;
      attributes?: { content?: unknown };
      children?: unknown[];
    };
    if (typeof value.attributes?.content === "string") text += value.attributes.content;
    if (typeof value.text === "string") text += value.text;
    if (Array.isArray(value.children)) text += extractText(value.children);
  }
  return text;
}

/** 提取顶层段落与引用，用于便签长图弹窗的逐段排版。 */
function extractParagraphs(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  const result: string[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const value = node as { type?: unknown; children?: unknown[] };
    if (value.type === "paragraph" || value.type === "blockquote") {
      const text = extractText(value.children).trim();
      if (text) result.push(text);
    }
  }
  return result;
}

function toEntry(slug: string, raw: string): PostEntry {
  const { data, body } = parseFrontmatter(raw);
  const category = (
    data.category && data.category in categoryMeta ? data.category : "thinking"
  ) as CategoryKey;
  const { document, readTime } = toDocument(body);
  return {
    slug,
    title: data.title || slug,
    date: data.date || "",
    category,
    summary: data.summary || "",
    readTime,
    document,
  };
}

/* --------------------------------- GitHub --------------------------------- */

interface GithubContentItem {
  name: string;
  sha: string;
  type: string;
}

const PER_PAGE = 100;
const MAX_PAGES = 10;

/** Contents API 单页最多 100 条，超量后必须翻页，否则旧文章会静默消失。 */
async function listRemote(dir: string): Promise<GithubContentItem[]> {
  const config = repoConfig();
  if (!config) return [];
  const items: GithubContentItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await github(
      `/repos/${config.repo}/contents/${dir}?ref=${encodeURIComponent(config.branch)}&per_page=${PER_PAGE}&page=${page}`,
      { revalidate: 60 }
    );
    // 目录 404 说明路径配置错误，按内容源异常处理；目录存在但为空（200 + []）才是正常
    if (response.status === 404) {
      throw new Error(
        `GitHub 内容目录不存在：${config.repo}@${config.branch}/${dir}（404）`
      );
    }
    if (!response.ok) throw new Error(`GitHub 目录读取失败：${response.status}`);
    const batch = (await response.json()) as GithubContentItem[] | GithubContentItem;
    // 目标路径是单个文件时返回对象而不是数组，直接停止
    if (!Array.isArray(batch)) break;
    items.push(
      ...batch.filter(
        (item) => item.type === "file" && /\.(md|mdoc)$/i.test(item.name)
      )
    );
    if (batch.length < PER_PAGE) break;
  }
  return items;
}

async function readRemote(
  dir: string,
  name: string,
  options?: { fresh?: boolean }
): Promise<{ raw: string; sha: string } | null> {
  const config = repoConfig();
  if (!config) return null;
  const response = await github(
    `/repos/${config.repo}/contents/${dir}/${encodeURIComponent(name)}?ref=${encodeURIComponent(config.branch)}`,
    // 409 重试时绕开缓存，必须拿到最新 sha
    { revalidate: options?.fresh ? 0 : 60 }
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { content?: string; sha?: string };
  if (!data.content) return null;
  return {
    raw: Buffer.from(data.content, "base64").toString("utf8"),
    sha: data.sha ?? "",
  };
}

async function writeRemote(
  dir: string,
  name: string,
  content: string,
  message: string
): Promise<void> {
  const config = repoConfig();
  if (!config) throw new Error("GitHub 内容源未配置");

  // 409 通常是并发提交导致 sha 过期：重新读取最新 sha 后重试，上限 2 次
  let attempt = 0;
  while (true) {
    const existing = await readRemote(dir, name, { fresh: attempt > 0 });
    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: config.branch,
    };
    if (existing?.sha) body.sha = existing.sha;

    const response = await github(
      `/repos/${config.repo}/contents/${dir}/${encodeURIComponent(name)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (response.status === 409 && attempt < 2) {
      attempt += 1;
      continue;
    }
    if (!response.ok) {
      throw new Error(`GitHub 写入失败：${response.status} ${await response.text()}`);
    }
    return;
  }
}

async function removeRemote(
  dir: string,
  name: string,
  message: string
): Promise<void> {
  const config = repoConfig();
  if (!config) throw new Error("GitHub 内容源未配置");
  const existing = await readRemote(dir, name);
  if (!existing) return;
  const response = await github(`/repos/${config.repo}/contents/${dir}/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      sha: existing.sha,
      branch: config.branch,
    }),
  });
  if (!response.ok) {
    throw new Error(`GitHub 删除失败：${response.status} ${await response.text()}`);
  }
}

/* ---------------------------------- local --------------------------------- */

/* 本地回退目录仅开发/自托管时使用，路径按运行期目录拼接；
   显式关闭 Turbopack 的静态追踪，避免整个项目被打包进服务端产物。 */
function localDir(dir: string): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), dir);
}

async function listLocal(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(/*turbopackIgnore: true*/ localDir(dir));
    return files.filter((name) => /\.(md|mdoc)$/i.test(name));
  } catch {
    return [];
  }
}

async function readLocal(dir: string, name: string): Promise<string | null> {
  try {
    return await fs.readFile(
      /*turbopackIgnore: true*/ path.join(localDir(dir), name),
      "utf8"
    );
  } catch {
    return null;
  }
}

async function writeLocal(dir: string, name: string, content: string): Promise<void> {
  await fs.mkdir(localDir(dir), { recursive: true });
  await fs.writeFile(
    /*turbopackIgnore: true*/ path.join(localDir(dir), name),
    content,
    "utf8"
  );
}

async function removeLocal(dir: string, name: string): Promise<void> {
  try {
    await fs.unlink(/*turbopackIgnore: true*/ path.join(localDir(dir), name));
  } catch {
    /* 文件不存在时忽略 */
  }
}

/* ------------------------------ 通用内容读写 ------------------------------ */

export interface ContentFile {
  name: string;
  raw: string;
}

export interface ContentLoadResult {
  files: ContentFile[];
  /** 远程源不可达（或部分文件读取失败）时为 true，调用方据此渲染非阻断提示 */
  degraded: boolean;
}

async function loadLocalFiles(dir: string): Promise<ContentFile[]> {
  const files = await listLocal(dir);
  const result: ContentFile[] = [];
  for (const name of files) {
    const raw = await readLocal(dir, name);
    if (raw) result.push({ name, raw });
  }
  return result;
}

/** 读取目录下所有 Markdown 文件；配置了仓库时优先远程，异常时回退本地并标记降级。 */
export async function loadContentFilesWithStatus(dir: string): Promise<ContentLoadResult> {
  if (githubReady()) {
    try {
      const files = await listRemote(dir);
      const raws = await Promise.all(
        files.map(async (file) => ({ file, data: await readRemote(dir, file.name) }))
      );
      return {
        files: raws
          .filter((item) => item.data !== null)
          .map(({ file, data }) => ({ name: file.name, raw: data!.raw })),
        // 目录可读但个别文件读取失败，同样视为数据不完整
        degraded: raws.some((item) => item.data === null),
      };
    } catch (error) {
      console.error(`[content] GitHub 读取 ${dir} 失败，回退本地文件：`, error);
      return { files: await loadLocalFiles(dir), degraded: true };
    }
  }

  return { files: await loadLocalFiles(dir), degraded: false };
}

export async function loadContentFiles(dir: string): Promise<ContentFile[]> {
  return (await loadContentFilesWithStatus(dir)).files;
}

export async function readContentFile(dir: string, name: string): Promise<string | null> {
  return githubReady() ? (await readRemote(dir, name))?.raw ?? null : readLocal(dir, name);
}

export async function writeContentFile(
  dir: string,
  name: string,
  content: string,
  message: string
): Promise<void> {
  if (githubReady()) {
    await writeRemote(dir, name, content, message);
  } else {
    await writeLocal(dir, name, content);
  }
}

export async function deleteContentFile(
  dir: string,
  name: string,
  message: string
): Promise<void> {
  if (githubReady()) {
    await removeRemote(dir, name, message);
  } else {
    await removeLocal(dir, name);
  }
}

/* ---------------------------------- API ---------------------------------- */

export interface PostsLoadResult {
  posts: PostEntry[];
  degraded: boolean;
}

export async function loadPostsWithStatus(): Promise<PostsLoadResult> {
  const { files, degraded } = await loadContentFilesWithStatus(POSTS_DIR);
  const posts = files
    .map(({ name, raw }) => toEntry(name.replace(/\.(md|mdoc)$/i, ""), raw))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { posts, degraded };
}

export async function loadPosts(): Promise<PostEntry[]> {
  return (await loadPostsWithStatus()).posts;
}

/** 单篇加载结果：区分「不存在」与「内容源不可用」，供页面/接口给出正确状态码。 */
export type PostLoadResult =
  | { status: "ok"; post: PostEntry }
  | { status: "not_found" }
  | { status: "unavailable" };

export async function loadPostWithStatus(slug: string): Promise<PostLoadResult> {
  const result = await readPostSource(slug);
  if (result.status === "missing") return { status: "not_found" };
  if (result.status === "unavailable") return { status: "unavailable" };
  return { status: "ok", post: toEntry(slug, result.raw) };
}

/** 兼容旧调用（sitemap / feed / 后台列表）：内容源异常时按无数据处理。 */
export async function loadPost(slug: string): Promise<PostEntry | null> {
  const result = await loadPostWithStatus(slug);
  return result.status === "ok" ? result.post : null;
}

export async function loadDraft(slug: string): Promise<PostDraft | null> {
  const result = await readPostSource(slug);
  // 编辑态下内容源异常必须显式失败，否则会把已有文章当成新草稿覆盖
  if (result.status === "unavailable") {
    throw new Error("内容源暂时不可用，无法读取草稿");
  }
  if (result.status === "missing") return null;
  const { data, body } = parseFrontmatter(result.raw);
  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? new Date().toISOString().slice(0, 10),
    category: (data.category && data.category in categoryMeta
      ? data.category
      : "thinking") as CategoryKey,
    summary: data.summary ?? "",
    body: body.replace(/^\n+/, ""),
  };
}

export async function savePost(draft: PostDraft): Promise<void> {
  if (!isValidSlug(draft.slug)) throw new Error("文件名只能包含字母、数字与短横线");
  const content = serializePost({
    ...draft,
    date: normalizeDate(draft.date),
  });
  await writeContentFile(
    POSTS_DIR,
    `${draft.slug}.mdoc`,
    content,
    `content(posts): ${draft.slug} via Smartisan Studio`
  );
}

export async function deletePost(slug: string): Promise<void> {
  if (!isValidSlug(slug)) throw new Error("非法文件名");
  await deleteContentFile(
    POSTS_DIR,
    `${slug}.mdoc`,
    `content(posts): remove ${slug} via Smartisan Studio`
  );
}
