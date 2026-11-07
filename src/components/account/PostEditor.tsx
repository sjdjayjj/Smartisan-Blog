"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Markdoc from "@markdoc/markdoc";
import {
  ArrowLeft,
  Check,
  Loader2,
  Save,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import MarkdocContent from "@/components/MarkdocContent";
import EditorToolbar from "@/components/account/EditorToolbar";
import {
  CategoryField,
  DateField,
  FieldLabel,
} from "@/components/account/SmartisanFields";
import { AiFloat, AiToolbar, type AnchorGetter, type AnchorRect } from "@/components/account/AiFloat";
import { playMechanicalClick } from "@/lib/audio";
import { showToast } from "@/lib/bus";
import { uploadMedia } from "@/lib/upload-client";
import { type CategoryKey } from "@/lib/site";
import type { PostDraft } from "@/lib/github";
import {
  AiRequestError,
  streamAiTask,
  type RewriteStyle,
} from "@/lib/ai-client";
import { diffText, type DiffSegment } from "@/lib/text-diff";
import { parseProofreadResult, parseTagsResult, type ProofreadIssue, type TagsResult } from "@/lib/ai-parse";
import { textareaCaretRect } from "@/lib/caret";

function deriveSlug(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  if (ascii.length >= 2) return ascii.slice(0, 60);
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  return `post-${stamp}`;
}

const AI_TIMEOUT_MS = 120_000;
const REWRITE_LIMIT = 2_000;
const PROOFREAD_BATCH_LIMIT = 30;

const REWRITE_STYLES: Array<{ key: RewriteStyle; label: string; hint: string }> = [
  { key: "polish", label: "润色", hint: "提升用词与节奏" },
  { key: "concise", label: "精简", hint: "去掉冗余表达" },
  { key: "expand", label: "扩写", hint: "补充细节与逻辑" },
  { key: "tone", label: "换语气", hint: "改为克制书面的语气" },
];

type AiPanel = "summary" | "rewrite" | "proofread" | "tags" | null;

interface EditorSelection {
  start: number;
  end: number;
  text: string;
}

interface AiRun {
  controller: AbortController;
  timedOut: boolean;
}

type ProofreadItem = ProofreadIssue & { stale?: boolean };

/** 中断与失败要区分：用户点停止不该弹错误。 */
function describeAiError(error: unknown, run: AiRun): string | null {
  if ((error as { name?: string })?.name === "AbortError") {
    return run.timedOut ? "生成超时（120 秒），请稍后重试" : null;
  }
  if (error instanceof AiRequestError) return error.message;
  return "生成失败，请稍后再试";
}

function DiffView({ segments }: { segments: DiffSegment[] }) {
  return (
    <div className="st-well rounded-lg p-2.5 max-h-[26vh] overflow-y-auto">
      <p className="text-xs font-sans leading-6 whitespace-pre-wrap break-words">
        {segments.map((segment, index) => {
          if (segment.type === "same") {
            return (
              <span key={index} className="text-smartisan-text">
                {segment.text}
              </span>
            );
          }
          if (segment.type === "remove") {
            return (
              <span key={index} className="text-smartisan-red/80 line-through">
                {segment.text}
              </span>
            );
          }
          return (
            <span key={index} className="text-smartisan-ink bg-smartisan-gold/15 rounded-sm">
              {segment.text}
            </span>
          );
        })}
      </p>
    </div>
  );
}

export default function PostEditor({
  initial,
  initialDraft = null,
  r2Ready,
  aiReady,
}: {
  initial: PostDraft | null;
  initialDraft?: string | null;
  r2Ready: boolean;
  aiReady: boolean;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const summaryBtnRef = useRef<HTMLButtonElement>(null);
  const tagsBtnRef = useRef<HTMLButtonElement>(null);
  const proofreadBtnRef = useRef<HTMLButtonElement>(null);
  const selectionRef = useRef<EditorSelection | null>(null);
  const rewriteAnchorRef = useRef<AnchorRect | null>(null);
  const aiRunRef = useRef<AiRun | null>(null);
  const isEditing = Boolean(initial);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<CategoryKey>(initial?.category ?? "thinking");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? initialDraft ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [showToolbar, setShowToolbar] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaKind, setMediaKind] = useState<"image" | "video" | "file">("image");
  const [uploading, setUploading] = useState(false);

  const [aiPanel, setAiPanel] = useState<AiPanel>(null);
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [toolbarOpen, setToolbarOpen] = useState(false);

  // 摘要
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summaryError, setSummaryError] = useState("");

  // 选区改写
  const [rewriteStyle, setRewriteStyle] = useState<RewriteStyle>("polish");
  const [rewriteSource, setRewriteSource] = useState("");
  const [rewriteRange, setRewriteRange] = useState<{ start: number; end: number } | null>(null);
  const [rewriteText, setRewriteText] = useState("");
  const [rewriteDiff, setRewriteDiff] = useState<DiffSegment[] | null>(null);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteError, setRewriteError] = useState("");

  // 全文校对
  const [proofreadLoading, setProofreadLoading] = useState(false);
  const [proofreadRaw, setProofreadRaw] = useState("");
  const [proofreadIssues, setProofreadIssues] = useState<ProofreadItem[]>([]);
  const [proofreadParsed, setProofreadParsed] = useState(true);
  const [proofreadError, setProofreadError] = useState("");

  // 标签与 SEO 描述
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsResult, setTagsResult] = useState<TagsResult | null>(null);
  const [tagsRaw, setTagsRaw] = useState("");
  const [tagsError, setTagsError] = useState("");

  const readTime = Math.max(2, Math.round(body.length / 400));

  const previewNodes = useMemo(() => {
    try {
      return Markdoc.parse(body).children;
    } catch {
      return [];
    }
  }, [body]);

  // 表单变更标记
  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => () => aiRunRef.current?.controller.abort(), []);

  const beginAiRun = useCallback((): AiRun => {
    aiRunRef.current?.controller.abort();
    const controller = new AbortController();
    const run: AiRun = { controller, timedOut: false };
    aiRunRef.current = run;
    window.setTimeout(() => {
      // 只有仍是当前请求时才触发超时，避免误伤后续任务
      if (aiRunRef.current === run) {
        run.timedOut = true;
        controller.abort();
      }
    }, AI_TIMEOUT_MS);
    return run;
  }, []);

  const finishAiRun = useCallback((run: AiRun) => {
    if (aiRunRef.current === run) aiRunRef.current = null;
  }, []);

  const stopAi = useCallback(() => {
    aiRunRef.current?.controller.abort();
  }, []);

  const closeAiPanel = useCallback(() => {
    aiRunRef.current?.controller.abort();
    setAiPanel(null);
  }, []);

  const insertAtCursor = (before: string, after = "") => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const selected = body.slice(start, end);
    const inserted = `${before}${selected}${after}`;
    setBody(body.slice(0, start) + inserted + body.slice(end));
    markDirty();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + before.length + selected.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const openMedia = () => setMediaOpen(true);

  const insertMedia = (url: string, kind: "image" | "video" | "file", name = "媒体资源") => {
    if (!url) {
      showToast("请填写资源地址");
      return;
    }
    if (kind === "image") {
      insertAtCursor(`![${name}](${url})`, "\n");
    } else if (kind === "video") {
      insertAtCursor(`<video src="${url}" controls playsinline></video>`, "\n");
    } else {
      insertAtCursor(`[${name}](${url})`, "\n");
    }
    setMediaOpen(false);
    setMediaUrl("");
    showToast("已插入媒体资源");
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadMedia(file);
      const kind: "image" | "video" | "file" = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file";
      insertMedia(url, kind, file.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败";
      console.error("[editor] 媒体上传失败", error);
      showToast(message);
    } finally {
      setUploading(false);
    }
  };

  /* ---------------------------- 选区跟踪 ---------------------------- */

  const syncSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = end > start ? el.value.slice(start, end) : "";
    if (!text.trim()) {
      selectionRef.current = null;
      setSelection(null);
      setToolbarOpen(false);
      return;
    }
    const next: EditorSelection = { start, end, text };
    selectionRef.current = next;
    setSelection(next);
    setToolbarOpen(true);
  }, []);

  const getSelectionAnchor = useCallback<AnchorGetter>(() => {
    const el = textareaRef.current;
    const current = selectionRef.current;
    if (!el || !current) return null;
    const caret = textareaCaretRect(el, current.start);
    if (!caret) return null;
    return {
      left: caret.left,
      top: caret.top,
      right: caret.left,
      bottom: caret.bottom,
      width: 0,
      height: caret.height,
    };
  }, []);

  const getRewriteAnchor = useCallback<AnchorGetter>(() => rewriteAnchorRef.current, []);

  /* ---------------------------- 摘要 ---------------------------- */

  /** 生成摘要：只写入预览，用户确认后才落到 summary 字段，正文永远不动。 */
  const generateSummary = async () => {
    if (!aiReady || summaryLoading) return;
    if (!body.trim()) {
      showToast("正文为空，无法生成摘要");
      return;
    }
    setAiPanel("summary");
    setSummaryLoading(true);
    setSummaryDraft("");
    setSummaryError("");
    setToolbarOpen(false);
    const run = beginAiRun();
    try {
      const text = await streamAiTask({
        task: "summary",
        input: body,
        signal: run.controller.signal,
        onChunk: (partial) => setSummaryDraft(partial.trim()),
      });
      if (!text) {
        setSummaryError("模型没有返回内容，请重试");
        return;
      }
      setSummaryDraft(text);
    } catch (error) {
      const message = describeAiError(error, run);
      if (message) {
        setSummaryError(message);
        if (aiRunRef.current === run) showToast(message);
      } else if (aiRunRef.current === run) {
        showToast("已停止生成");
      }
    } finally {
      finishAiRun(run);
      setSummaryLoading(false);
    }
  };

  const adoptSummary = () => {
    const value = summaryDraft.trim().slice(0, 200);
    if (!value) return;
    setSummary(value);
    markDirty();
    closeAiPanel();
    setSummaryDraft("");
    setSummaryError("");
    showToast("摘要已采用，保存后生效");
  };

  /* ---------------------------- 选区改写 ---------------------------- */

  const startRewrite = async (style: RewriteStyle) => {
    const current = selectionRef.current;
    if (!current) return;
    if (current.text.length > REWRITE_LIMIT) {
      showToast(`选区 ${current.text.length} 字，超过 ${REWRITE_LIMIT} 字上限，请分段改写`);
      return;
    }
    const el = textareaRef.current;
    if (el) {
      const caret = textareaCaretRect(el, current.start);
      rewriteAnchorRef.current = caret
        ? {
            left: caret.left,
            top: caret.top,
            right: caret.left,
            bottom: caret.bottom,
            width: 0,
            height: caret.height,
          }
        : null;
    }

    setRewriteStyle(style);
    setRewriteSource(current.text);
    setRewriteRange({ start: current.start, end: current.end });
    setRewriteText("");
    setRewriteDiff(null);
    setRewriteError("");
    setRewriteLoading(true);
    setToolbarOpen(false);
    setAiPanel("rewrite");

    const run = beginAiRun();
    try {
      const text = await streamAiTask({
        task: "rewrite",
        input: current.text,
        style,
        signal: run.controller.signal,
        onChunk: (partial) => setRewriteText(partial),
      });
      if (!text) {
        setRewriteError("模型没有返回内容，请重试");
        return;
      }
      setRewriteText(text);
      setRewriteDiff(diffText(current.text, text));
    } catch (error) {
      const message = describeAiError(error, run);
      if (message) {
        setRewriteError(message);
        if (aiRunRef.current === run) showToast(message);
      } else if (aiRunRef.current === run) {
        showToast("已停止改写");
      }
    } finally {
      finishAiRun(run);
      setRewriteLoading(false);
    }
  };

  const adoptRewrite = () => {
    const value = rewriteText.trim();
    const range = rewriteRange;
    if (!value || !range) return;

    let start = range.start;
    let end = range.end;
    if (body.slice(start, end) !== rewriteSource) {
      const found = body.indexOf(rewriteSource);
      if (found < 0) {
        showToast("正文已变动，无法替换，请重新选择片段");
        return;
      }
      start = found;
      end = found + rewriteSource.length;
    }

    const nextBody = body.slice(0, start) + value + body.slice(end);
    setBody(nextBody);
    markDirty();
    closeAiPanel();
    setToolbarOpen(false);
    setSelection(null);
    selectionRef.current = null;
    setRewriteText("");
    setRewriteDiff(null);

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const caret = start + value.length;
      el.setSelectionRange(caret, caret);
    });
    showToast("已替换选中片段");
  };

  const cancelRewrite = () => {
    const range = rewriteRange;
    stopAi();
    setAiPanel(null);
    setRewriteText("");
    setRewriteDiff(null);
    setRewriteError("");
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el || !range) return;
      el.focus();
      el.setSelectionRange(range.start, range.end);
    });
    showToast("已取消，正文未改动");
  };

  /* ---------------------------- 全文校对 ---------------------------- */

  const runProofread = async () => {
    if (!aiReady || proofreadLoading) return;
    if (!body.trim()) {
      showToast("正文为空，无法校对");
      return;
    }
    setAiPanel("proofread");
    setProofreadLoading(true);
    setProofreadIssues([]);
    setProofreadRaw("");
    setProofreadParsed(true);
    setProofreadError("");
    setToolbarOpen(false);

    const run = beginAiRun();
    try {
      const text = await streamAiTask({
        task: "proofread",
        input: body,
        signal: run.controller.signal,
        onChunk: (partial) => setProofreadRaw(partial),
      });
      if (!text) {
        setProofreadError("模型没有返回内容，请重试");
        return;
      }
      setProofreadRaw(text);
      const parsed = parseProofreadResult(text, body);
      if (parsed.ok) {
        setProofreadIssues(parsed.issues);
        setProofreadParsed(true);
      } else {
        setProofreadIssues([]);
        setProofreadParsed(false);
        setProofreadError("无法结构化，未提供定位；以下是模型原始输出，请手动处理");
      }
    } catch (error) {
      const message = describeAiError(error, run);
      if (message) {
        setProofreadError(message);
        if (aiRunRef.current === run) showToast(message);
      } else if (aiRunRef.current === run) {
        showToast("已停止校对");
      }
    } finally {
      finishAiRun(run);
      setProofreadLoading(false);
    }
  };

  const revealIssue = (issue: ProofreadItem) => {
    if (issue.start < 0) return;
    if (tab !== "write") setTab("write");
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(issue.start, issue.end);
      const caret = textareaCaretRect(el, issue.start);
      if (caret) {
        const contentTop = caret.top - el.getBoundingClientRect().top + el.scrollTop;
        el.scrollTop = Math.max(0, contentTop - el.clientHeight / 2);
      }
      el.classList.add("st-ai-flash");
      window.setTimeout(() => el.classList.remove("st-ai-flash"), 800);
    });
  };

  const adoptIssue = (issue: ProofreadItem) => {
    let start = issue.start;
    let end = issue.end;
    if (start < 0 || body.slice(start, end) !== issue.quote) {
      const found = body.indexOf(issue.quote);
      if (found < 0) {
        showToast("原文已变更，无法定位该片段");
        return;
      }
      start = found;
      end = found + issue.quote.length;
    }

    const delta = issue.suggestion.length - (end - start);
    setBody(body.slice(0, start) + issue.suggestion + body.slice(end));
    markDirty();
    setProofreadIssues((previous) =>
      previous
        .filter((item) => item.id !== issue.id)
        .map((item) => {
          if (item.start >= end) {
            return { ...item, start: item.start + delta, end: item.end + delta };
          }
          if (item.end > start) {
            return { ...item, stale: true };
          }
          return item;
        })
    );
    showToast("已替换该片段");
  };

  /* ---------------------------- 标签与 SEO 描述 ---------------------------- */

  const generateTags = async () => {
    if (!aiReady || tagsLoading) return;
    if (!body.trim()) {
      showToast("正文为空，无法生成标签");
      return;
    }
    setAiPanel("tags");
    setTagsLoading(true);
    setTagsResult(null);
    setTagsRaw("");
    setTagsError("");
    setToolbarOpen(false);

    const run = beginAiRun();
    try {
      const text = await streamAiTask({
        task: "tags",
        input: body,
        signal: run.controller.signal,
      });
      if (!text) {
        setTagsError("模型没有返回内容，请重试");
        return;
      }
      setTagsRaw(text);
      const parsed = parseTagsResult(text);
      if (parsed.ok) {
        setTagsResult(parsed.result);
      } else {
        setTagsError("无法结构化，以下是模型原始输出，请手动处理");
      }
    } catch (error) {
      const message = describeAiError(error, run);
      if (message) {
        setTagsError(message);
        if (aiRunRef.current === run) showToast(message);
      } else if (aiRunRef.current === run) {
        showToast("已停止生成");
      }
    } finally {
      finishAiRun(run);
      setTagsLoading(false);
    }
  };

  const adoptDescription = () => {
    const description = tagsResult?.description.trim();
    if (!description) return;
    setSummary(description.slice(0, 200));
    markDirty();
    closeAiPanel();
    showToast("SEO 描述已写入 summary 字段，保存后生效");
  };

  /* ---------------------------- 保存 / 删除 ---------------------------- */

  const save = async () => {
    if (saving) return;
    if (!title.trim()) {
      showToast("请填写文章标题");
      return;
    }
    if (!slug.trim()) {
      showToast("请填写文件名");
      return;
    }
    if (!body.trim()) {
      showToast("正文不能为空");
      return;
    }

    setSaving(true);
    playMechanicalClick(1100, 0.05);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title, date, category, summary, body }),
      });
      const data = (await response.json()) as { ok?: boolean; slug?: string; error?: string };
      if (!response.ok) {
        showToast(data.error ?? "保存失败");
        return;
      }
      setDirty(false);
      showToast(isEditing ? "已提交更新" : "文章已发布");
      if (!isEditing && data.slug) {
        router.replace(`/account/editor?slug=${encodeURIComponent(data.slug)}`);
      } else {
        router.refresh();
      }
    } catch {
      showToast("保存失败，请稍后再试");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, title, slug, body, date, category, summary]);

  const remove = async () => {
    if (!initial || deleting) return;
    if (!window.confirm(`确定删除《${initial.title}》吗？此操作会直接提交到仓库。`)) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/posts?slug=${encodeURIComponent(initial.slug)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        showToast(data.error ?? "删除失败");
        return;
      }
      showToast("文章已删除");
      router.push("/account");
    } catch {
      showToast("删除失败，请稍后再试");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full space-y-5">
      {/* 顶部操作条 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/account"
            className="st-btn st-btn-icon-lg flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink"
            aria-label="返回文章列表"
          >
            <ArrowLeft size={14} />
          </Link>
          <div className="min-w-0">
            <h1 className="font-serif text-lg sm:text-xl font-bold text-smartisan-ink truncate">
              {isEditing ? "编辑文章" : "新增文章"}
            </h1>
            <p className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              {isEditing ? `${initial?.slug}.mdoc` : "NEW DRAFT"} ·{" "}
              {dirty ? "UNSAVED" : "SYNCED"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="st-btn st-btn-lg font-sans text-smartisan-muted hover:text-smartisan-red flex items-center gap-1.5"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              删除
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="st-btn st-btn-lg font-sans text-smartisan-ink flex items-center gap-2"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin text-smartisan-red" />
            ) : dirty ? (
              <Save size={14} className="text-smartisan-red" />
            ) : (
              <Check size={14} className="text-smartisan-gold" />
            )}
            {saving ? "提交中…" : isEditing ? "保存修改" : "发布文章"}
          </button>
        </div>
      </div>

      {/* 元信息面板 */}
      <section className="st-card relative z-10 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <label className="lg:col-span-2 space-y-1.5 block">
            <FieldLabel text="文章标题 · TITLE" />
            <input
              value={title}
              onChange={(event) => {
                const nextTitle = event.target.value;
                setTitle(nextTitle);
                if (!slugTouched && nextTitle) setSlug(deriveSlug(nextTitle));
                markDirty();
              }}
              placeholder="例如：论细节的尊严"
              className="w-full bg-smartisan-sunken border border-smartisan-line rounded-lg px-3 py-2.5 text-sm font-serif text-smartisan-ink placeholder:text-smartisan-faint outline-none focus:border-smartisan-red/50 transition"
            />
          </label>

          <label className="space-y-1.5 block">
            <FieldLabel text="文件名 · SLUG" />
            <input
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugTouched(true);
                markDirty();
              }}
              placeholder="my-new-post"
              pattern="[a-zA-Z0-9-]+"
              className="w-full bg-smartisan-sunken border border-smartisan-line rounded-lg px-3 py-2.5 text-sm font-mono text-smartisan-gold placeholder:text-smartisan-faint outline-none focus:border-smartisan-red/50 transition"
            />
          </label>

          <div className="space-y-1.5">
            <FieldLabel text="发布日期 · DATE" />
            <DateField
              value={date}
              onChange={(next) => {
                setDate(next);
                markDirty();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel text="分类 · CATEGORY" />
            <CategoryField
              value={category}
              onChange={(next) => {
                setCategory(next);
                markDirty();
              }}
            />
          </div>

          <div className="space-y-1.5 lg:col-span-1">
            <FieldLabel
              text="摘要 · SUMMARY"
              action={
                aiReady ? (
                  <>
                    <button
                      ref={summaryBtnRef}
                      type="button"
                      onClick={() => {
                        if (aiPanel === "summary") {
                          closeAiPanel();
                        } else {
                          void generateSummary();
                        }
                      }}
                      disabled={summaryLoading}
                      className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-ink flex items-center gap-1 disabled:opacity-40"
                    >
                      {summaryLoading ? (
                        <Loader2 size={10} className="animate-spin text-smartisan-red" />
                      ) : (
                        <Sparkles size={10} className="text-smartisan-gold" />
                      )}
                      {summaryLoading ? "生成中…" : "生成摘要"}
                    </button>
                    <button
                      ref={tagsBtnRef}
                      type="button"
                      onClick={() => {
                        if (aiPanel === "tags") {
                          closeAiPanel();
                        } else {
                          void generateTags();
                        }
                      }}
                      disabled={tagsLoading}
                      className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-ink flex items-center gap-1 disabled:opacity-40"
                    >
                      {tagsLoading ? (
                        <Loader2 size={10} className="animate-spin text-smartisan-gold" />
                      ) : (
                        <Tag size={10} className="text-smartisan-muted" />
                      )}
                      标签 · SEO
                    </button>
                  </>
                ) : null
              }
            />
            <input
              value={summary}
              onChange={(event) => {
                setSummary(event.target.value);
                markDirty();
              }}
              placeholder="一到两句话，会显示在卡片上"
              className="w-full bg-smartisan-sunken border border-smartisan-line rounded-lg px-3 py-2.5 text-sm font-sans text-smartisan-text placeholder:text-smartisan-faint outline-none focus:border-smartisan-red/50 transition"
            />
          </div>
        </div>
      </section>

      {/* 编辑区 */}
      <section className="st-card rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-smartisan-hairline">
          <div className="flex items-center gap-1.5">
            {(["write", "preview"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  playMechanicalClick(800, 0.03);
                  setTab(key);
                }}
                className={`st-btn-sm font-mono tracking-wide transition ${
                  tab === key
                    ? "bg-smartisan-red/10 text-smartisan-red border border-smartisan-red/30"
                    : "text-smartisan-muted hover:text-smartisan-ink border border-transparent"
                } ${key === "preview" ? "lg:hidden" : ""}`}
              >
                {key === "write" ? "编辑 EDIT" : "预览 PREVIEW"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {aiReady ? (
              <button
                ref={proofreadBtnRef}
                type="button"
                onClick={() => {
                  if (aiPanel === "proofread") {
                    closeAiPanel();
                  } else {
                    void runProofread();
                  }
                }}
                disabled={proofreadLoading}
                className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-ink flex items-center gap-1 disabled:opacity-40"
              >
                {proofreadLoading ? (
                  <Loader2 size={10} className="animate-spin text-smartisan-red" />
                ) : (
                  <Sparkles size={10} className="text-smartisan-gold" />
                )}
                {proofreadLoading ? "校对中…" : "全文校对"}
              </button>
            ) : null}
            <div className="font-mono text-[10px] text-smartisan-muted tracking-wide">
              {body.length} 字符 · {readTime} MIN READ
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <EditorToolbar
            onInsert={insertAtCursor}
            onUpload={openMedia}
            showMenu={showToolbar}
            setShowMenu={setShowToolbar}
            r2Ready={r2Ready}
          />
        </div>

        <div className="grid lg:grid-cols-2 border-t border-smartisan-hairline">
          <div className={`${tab === "preview" ? "hidden" : "block"} lg:block`}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-smartisan-hairline bg-smartisan-sunken">
              <span className="w-1.5 h-1.5 rounded-full bg-smartisan-red" />
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                Markdown Source
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                markDirty();
              }}
              onSelect={syncSelection}
              onMouseUp={syncSelection}
              onKeyUp={syncSelection}
              spellCheck={false}
              placeholder={"从这里开始写正文…\n\n支持 # 标题、- 列表、> 引用、```代码块、![图片](地址)、<video src=\"地址\" controls></video>"}
              className="w-full min-h-[420px] lg:min-h-[560px] bg-smartisan-sunken px-4 py-4 font-mono text-[13px] leading-7 text-smartisan-text placeholder:text-smartisan-faint outline-none resize-y"
            />
          </div>

          <div
            className={`${
              tab === "write" ? "hidden" : "block"
            } lg:block border-t lg:border-t-0 lg:border-l border-smartisan-hairline`}
          >
            <div className="flex items-center gap-2 px-4 py-2 border-b border-smartisan-hairline bg-smartisan-sunken">
              <span className="w-1.5 h-1.5 rounded-full bg-smartisan-gold" />
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                Live Preview
              </span>
            </div>
            <div className="min-h-[420px] lg:min-h-[560px] px-5 py-5 bg-smartisan-surface overflow-y-auto">
              {body.trim() ? (
                <div className="article-body">
                  <MarkdocContent nodes={previewNodes} />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-16">
                  <span className="st-seal text-[10px]">待刊</span>
                  <p className="text-xs text-smartisan-muted font-sans">
                    左侧输入正文，这里会实时排版预览
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 选区改写工具条 */}
      <AiToolbar
        open={toolbarOpen && aiPanel === null && selection !== null}
        getAnchor={getSelectionAnchor}
        ignoreRef={textareaRef}
        onClose={() => setToolbarOpen(false)}
      >
        {selection && selection.text.length > REWRITE_LIMIT ? (
          <span className="px-2 font-mono text-[10px] text-smartisan-red">
            选区 {selection.text.length} 字，超过 {REWRITE_LIMIT} 字上限
          </span>
        ) : (
          REWRITE_STYLES.map((item) => (
            <button
              key={item.key}
              type="button"
              title={item.hint}
              onClick={() => void startRewrite(item.key)}
              className="st-btn-sm font-sans text-smartisan-text hover:bg-smartisan-veil hover:text-smartisan-ink transition"
            >
              {item.label}
            </button>
          ))
        )}
      </AiToolbar>

      {/* 摘要浮层 */}
      <AiFloat
        open={aiPanel === "summary"}
        onClose={closeAiPanel}
        title="AI 摘要"
        meta="SUMMARY"
        anchorRef={summaryBtnRef}
        ignoreRef={summaryBtnRef}
      >
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              {summaryLoading ? "正在生成" : summaryError ? "生成失败" : "生成结果"}
            </span>
            <span className="font-mono text-[10px] text-smartisan-faint">
              {summaryDraft.length} 字
            </span>
          </div>
          {summaryError ? (
            <p className="text-xs font-sans leading-6 text-smartisan-red">{summaryError}</p>
          ) : (
            <div className="st-well rounded-lg p-2.5 max-h-[24vh] overflow-y-auto">
              <p className="text-xs font-sans leading-6 whitespace-pre-wrap text-smartisan-text">
                {summaryDraft || (summaryLoading ? "正在生成…" : "还没有生成结果")}
              </p>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {summaryLoading ? (
              <button
                type="button"
                onClick={stopAi}
                className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-red"
              >
                停止
              </button>
            ) : null}
            <button
              type="button"
              onClick={adoptSummary}
              disabled={summaryLoading || !summaryDraft.trim()}
              className="st-btn st-btn-sm font-sans text-smartisan-ink flex items-center gap-1 disabled:opacity-40"
            >
              <Check size={11} className="text-smartisan-gold" />
              采用
            </button>
            <button
              type="button"
              onClick={closeAiPanel}
              className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-ink"
            >
              取消
            </button>
          </div>
          <p className="font-mono text-[10px] leading-5 text-smartisan-faint">
            采用后写入摘要字段，正文不受影响。
          </p>
        </div>
      </AiFloat>

      {/* 选区改写浮层 */}
      <AiFloat
        open={aiPanel === "rewrite"}
        onClose={cancelRewrite}
        title="选区改写"
        meta={REWRITE_STYLES.find((item) => item.key === rewriteStyle)?.label}
        getAnchor={getRewriteAnchor}
        ignoreRef={textareaRef}
      >
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-smartisan-muted">
            <span>
              原文 {rewriteSource.length} 字 → 改写 {rewriteText.trim().length} 字
            </span>
            {rewriteDiff ? (
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-smartisan-red/40" />
                  原文
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-smartisan-gold/40" />
                  改写
                </span>
              </span>
            ) : null}
          </div>

          {rewriteError ? (
            <p className="text-xs font-sans leading-6 text-smartisan-red">{rewriteError}</p>
          ) : rewriteDiff ? (
            <DiffView segments={rewriteDiff} />
          ) : (
            <div className="st-well rounded-lg p-2.5 max-h-[26vh] overflow-y-auto">
              <p className="text-xs font-sans leading-6 whitespace-pre-wrap text-smartisan-text">
                {rewriteText || "正在改写…"}
              </p>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {rewriteLoading ? (
              <button
                type="button"
                onClick={stopAi}
                className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-red"
              >
                停止
              </button>
            ) : null}
            <button
              type="button"
              onClick={adoptRewrite}
              disabled={rewriteLoading || !rewriteText.trim()}
              className="st-btn st-btn-sm font-sans text-smartisan-ink flex items-center gap-1 disabled:opacity-40"
            >
              <Check size={11} className="text-smartisan-gold" />
              采用替换
            </button>
            <button
              type="button"
              onClick={cancelRewrite}
              className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-ink"
            >
              取消
            </button>
          </div>
          <p className="font-mono text-[10px] leading-5 text-smartisan-faint">
            采用后只替换选中片段，其余正文不动。
          </p>
        </div>
      </AiFloat>

      {/* 全文校对浮层 */}
      <AiFloat
        open={aiPanel === "proofread"}
        onClose={closeAiPanel}
        title="全文校对"
        meta="PROOFREAD"
        anchorRef={proofreadBtnRef}
        ignoreRef={proofreadBtnRef}
      >
        <div className="space-y-2.5">
          {proofreadLoading ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                <Loader2 size={10} className="animate-spin text-smartisan-red" />
                正在校对全文
              </span>
              <button
                type="button"
                onClick={stopAi}
                className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-red"
              >
                停止
              </button>
            </div>
          ) : proofreadError && !proofreadRaw ? (
            <p className="text-xs font-sans leading-6 text-smartisan-red">{proofreadError}</p>
          ) : !proofreadParsed ? (
            <div className="space-y-2">
              <p className="text-[11px] font-sans leading-5 text-smartisan-red">
                无法结构化，未提供定位；以下是模型原始输出，请手动处理。
              </p>
              <div className="st-well rounded-lg p-2.5 max-h-[24vh] overflow-y-auto">
                <p className="text-xs font-sans leading-6 whitespace-pre-wrap text-smartisan-text">
                  {proofreadRaw}
                </p>
              </div>
            </div>
          ) : proofreadIssues.length === 0 ? (
            <p className="text-xs font-sans leading-6 text-smartisan-muted">
              没有发现需要处理的问题。
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                  {proofreadIssues.length} 条问题
                </span>
                {proofreadIssues.length > PROOFREAD_BATCH_LIMIT ? (
                  <span className="font-mono text-[10px] text-smartisan-red">
                    超过 {PROOFREAD_BATCH_LIMIT} 条，建议分批处理
                  </span>
                ) : null}
              </div>
              {proofreadIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="rounded-lg border border-smartisan-hairline bg-smartisan-surface/40 p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] tracking-widest text-smartisan-red/80 uppercase">
                      {issue.type}
                    </span>
                    <span className="font-mono text-[10px] text-smartisan-faint">
                      {issue.located ? `${issue.start}-${issue.end}` : "未定位"}
                    </span>
                  </div>
                  <p className="text-[11px] font-sans leading-5 text-smartisan-muted break-words">
                    原文：{issue.quote}
                  </p>
                  <p className="text-[11px] font-sans leading-5 text-smartisan-text break-words">
                    建议：{issue.suggestion}
                  </p>
                  {issue.reason ? (
                    <p className="text-[10px] font-sans leading-5 text-smartisan-muted">
                      理由：{issue.reason}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => revealIssue(issue)}
                      disabled={!issue.located}
                      className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-ink disabled:opacity-40"
                    >
                      定位
                    </button>
                    <button
                      type="button"
                      onClick={() => adoptIssue(issue)}
                      disabled={issue.stale}
                      className="st-btn st-btn-sm font-sans text-smartisan-ink disabled:opacity-40"
                    >
                      {issue.stale ? "原文已变更" : "采用"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="font-mono text-[10px] leading-5 text-smartisan-faint">
            逐条确认，不做一键全部替换。
          </p>
        </div>
      </AiFloat>

      {/* 标签与 SEO 描述浮层 */}
      <AiFloat
        open={aiPanel === "tags"}
        onClose={closeAiPanel}
        title="标签与 SEO 描述"
        meta="TAGS"
        anchorRef={tagsBtnRef}
        ignoreRef={tagsBtnRef}
      >
        <div className="space-y-2.5">
          {tagsLoading ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                <Loader2 size={10} className="animate-spin text-smartisan-gold" />
                正在生成
              </span>
              <button
                type="button"
                onClick={stopAi}
                className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-red"
              >
                停止
              </button>
            </div>
          ) : tagsResult ? (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                    标签建议
                  </span>
                  <span className="font-mono text-[10px] text-smartisan-faint">未写入</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tagsResult.tags.length ? (
                    tagsResult.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md border border-smartisan-hairline bg-smartisan-surface font-mono text-[10px] text-smartisan-muted"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] font-sans text-smartisan-muted">
                      模型没有给出标签
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-sans leading-5 text-smartisan-muted">
                  当前 frontmatter 没有 tags 字段，标签暂不写入；需要先确定 schema。
                </p>
              </div>

              <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-smartisan-red/60 to-transparent" />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                    SEO 描述 · SUMMARY
                  </span>
                  <span className="font-mono text-[10px] text-smartisan-faint">
                    {tagsResult.description.length} 字
                  </span>
                </div>
                <div className="st-well rounded-lg p-2.5 max-h-[22vh] overflow-y-auto">
                  <p className="text-xs font-sans leading-6 whitespace-pre-wrap text-smartisan-text">
                    {tagsResult.description || "模型没有给出描述"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={adoptDescription}
                  disabled={!tagsResult.description}
                  className="st-btn st-btn-sm font-sans text-smartisan-ink flex items-center gap-1 disabled:opacity-40"
                >
                  <Check size={11} className="text-smartisan-gold" />
                  采用描述
                </button>
                <button
                  type="button"
                  onClick={closeAiPanel}
                  className="st-btn st-btn-sm font-sans text-smartisan-muted hover:text-smartisan-ink"
                >
                  取消
                </button>
              </div>
              <p className="font-mono text-[10px] leading-5 text-smartisan-faint">
                站点 SEO description 取 summary 字段，采用后会同时更新卡片摘要。
              </p>
            </>
          ) : tagsError ? (
            <>
              <p className="text-xs font-sans leading-6 text-smartisan-red">{tagsError}</p>
              {tagsRaw ? (
                <div className="st-well rounded-lg p-2.5 max-h-[24vh] overflow-y-auto">
                  <p className="text-xs font-sans leading-6 whitespace-pre-wrap text-smartisan-text">
                    {tagsRaw}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-xs font-sans leading-6 text-smartisan-muted">
              还没有生成结果。
            </p>
          )}
        </div>
      </AiFloat>

      {/* 媒体弹窗 */}
      {mediaOpen ? (
        <div
          className="fixed inset-0 z-50 bg-smartisan-scrim backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-label="插入媒体"
          onClick={() => setMediaOpen(false)}
        >
          <div
            className="st-card rounded-2xl p-6 w-full max-w-md border border-smartisan-line-strong relative animate-scaleUp"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setMediaOpen(false)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-smartisan-socket border border-smartisan-line text-smartisan-muted hover:text-smartisan-ink flex items-center justify-center"
              aria-label="关闭"
            >
              <X size={13} />
            </button>

            <h3 className="font-serif text-lg font-bold text-smartisan-ink">插入媒体资源</h3>
            <p className="mt-1 text-[11px] text-smartisan-muted font-sans">
              {r2Ready
                ? "上传文件到 Cloudflare R2，或直接粘贴外部链接。"
                : "R2 未配置：可粘贴外部资源链接，上传功能将在配置后启用。"}
            </p>

            <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-smartisan-red to-transparent shadow-red-glow my-4" />

            <label className="block">
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                上传文件
              </span>
              <div className="mt-1.5 st-well rounded-xl p-4 text-center">
                <input
                  type="file"
                  accept="image/*,video/*,audio/*,application/pdf"
                  disabled={!r2Ready || uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                    event.target.value = "";
                  }}
                  className="w-full text-[11px] text-smartisan-muted file:mr-3 file:rounded-lg file:border-0 file:bg-smartisan-card file:px-3 file:py-1.5 file:text-[11px] file:text-smartisan-text disabled:opacity-40"
                />
                {uploading ? (
                  <div className="mt-2 flex items-center justify-center gap-2 font-mono text-[10px] text-smartisan-gold">
                    <Loader2 size={12} className="animate-spin" />
                    正在上传…
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-center gap-1.5 font-mono text-[10px] text-smartisan-muted">
                    <UploadCloud size={12} />
                    图片 / 视频 / 音频 / PDF，最大 60MB
                  </div>
                )}
              </div>
            </label>

            <div className="mt-4 space-y-2">
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                或粘贴地址
              </span>
              <input
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="https://…"
                className="w-full bg-smartisan-sunken border border-smartisan-line rounded-lg px-3 py-2.5 text-xs font-mono text-smartisan-text placeholder:text-smartisan-faint outline-none focus:border-smartisan-red/50"
              />
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { key: "image", label: "图片" },
                    { key: "video", label: "视频" },
                    { key: "file", label: "文件" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMediaKind(item.key)}
                    className={`st-btn-sm font-mono border transition ${
                      mediaKind === item.key
                        ? "border-smartisan-red/40 text-smartisan-red bg-smartisan-red/10"
                        : "border-smartisan-line text-smartisan-muted hover:text-smartisan-ink"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => insertMedia(mediaUrl.trim(), mediaKind)}
              className="st-btn st-btn-lg mt-5 w-full font-sans text-smartisan-ink"
            >
              插入到正文
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
