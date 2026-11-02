import {
  deleteContentFile,
  isValidSlug,
  loadContentFilesWithStatus,
  parseContentBody,
  parseFrontmatter,
  quote,
  readContentFile,
  writeContentFile,
} from "@/lib/github";

/**
 * 便签数据源：与文章共用一套 GitHub / 本地文件读写链路。
 * 便签是即时事件，所以字段刻意压到最少：标题、日期、分类标签与正文。
 */

/* 便签目录支持通过 BLOG_NOTES_DIR 覆盖，便于代码仓与私有内容仓分离。
   注意：该路径会直接拼进 GitHub API URL（未做编码），请勿包含空格或特殊字符。 */
export const NOTES_DIR = process.env.BLOG_NOTES_DIR?.trim() || "src/content/notes";

const DEFAULT_META = "即时随笔";
const DEFAULT_EYEBROW = "便签 · 即时事件";

export interface NoteEntry {
  slug: string;
  title: string;
  date: string;
  meta: string;
  eyebrow: string;
  /** Markdoc 根节点 children，纯 JSON，可安全跨 RSC 传递 */
  document: unknown;
  /** 顶层段落纯文本，供便签长图弹窗使用 */
  paragraphs: string[];
  plain: string;
}

export interface NoteDraft {
  slug: string;
  title: string;
  date: string;
  meta: string;
  eyebrow: string;
  body: string;
}

/** 便签长图弹窗所需的最小数据。 */
export interface NoteShare {
  slug: string;
  title: string;
  date: string;
  paragraphs: string[];
}

function normalizeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function toEntry(slug: string, raw: string): NoteEntry {
  const { data, body } = parseFrontmatter(raw);
  const { document, plain, paragraphs } = parseContentBody(body);
  return {
    slug,
    title: data.title || slug,
    date: data.date || "",
    meta: data.meta || DEFAULT_META,
    eyebrow: data.eyebrow || DEFAULT_EYEBROW,
    document,
    paragraphs,
    plain,
  };
}

function serializeNote(draft: NoteDraft): string {
  const frontmatter = [
    "---",
    `title: ${quote(draft.title)}`,
    `date: '${draft.date}'`,
    `meta: ${quote(draft.meta || DEFAULT_META)}`,
    `eyebrow: ${quote(draft.eyebrow || DEFAULT_EYEBROW)}`,
    "---",
    "",
  ].join("\n");
  return `${frontmatter}${draft.body.replace(/^\n+/, "")}\n`;
}

export interface NotesLoadResult {
  notes: NoteEntry[];
  /** 远程源不可达或数据不完整时为 true，调用方据此渲染非阻断提示 */
  degraded: boolean;
}

export async function loadNotesWithStatus(): Promise<NotesLoadResult> {
  const { files, degraded } = await loadContentFilesWithStatus(NOTES_DIR);
  const notes = files
    .map(({ name, raw }) => toEntry(name.replace(/\.(md|mdoc)$/i, ""), raw))
    .sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      return byDate !== 0 ? byDate : b.slug.localeCompare(a.slug);
    });
  return { notes, degraded };
}

export async function loadNotes(): Promise<NoteEntry[]> {
  return (await loadNotesWithStatus()).notes;
}

export async function loadNoteDraft(slug: string): Promise<NoteDraft | null> {
  const raw = await readContentFile(NOTES_DIR, `${slug}.mdoc`);
  if (!raw) return null;
  const { data, body } = parseFrontmatter(raw);
  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? new Date().toISOString().slice(0, 10),
    meta: data.meta ?? DEFAULT_META,
    eyebrow: data.eyebrow ?? DEFAULT_EYEBROW,
    body: body.replace(/^\n+/, ""),
  };
}

export async function saveNote(draft: NoteDraft): Promise<void> {
  if (!isValidSlug(draft.slug)) throw new Error("文件名只能包含字母、数字与短横线");
  const content = serializeNote({
    ...draft,
    date: normalizeDate(draft.date),
  });
  await writeContentFile(
    NOTES_DIR,
    `${draft.slug}.mdoc`,
    content,
    `content(notes): ${draft.slug} via Smartisan Studio`
  );
}

export async function deleteNote(slug: string): Promise<void> {
  if (!isValidSlug(slug)) throw new Error("非法文件名");
  await deleteContentFile(
    NOTES_DIR,
    `${slug}.mdoc`,
    `content(notes): remove ${slug} via Smartisan Studio`
  );
}

/** 与文章一致的 slug 生成规则，便签使用 note- 前缀兜底。 */
export function slugFromNoteTitle(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  if (ascii.length >= 2) return ascii.slice(0, 60);
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  return `note-${stamp}`;
}

export const noteDefaults = {
  meta: DEFAULT_META,
  eyebrow: DEFAULT_EYEBROW,
} as const;
