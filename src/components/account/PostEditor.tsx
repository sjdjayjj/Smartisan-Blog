"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Markdoc from "@markdoc/markdoc";
import {
  ArrowLeft,
  Check,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import MarkdocContent from "@/components/MarkdocContent";
import EditorToolbar from "@/components/account/EditorToolbar";
import { CategoryField, DateField } from "@/components/account/SmartisanFields";
import { playMechanicalClick } from "@/lib/audio";
import { showToast } from "@/lib/bus";
import { type CategoryKey } from "@/lib/site";
import type { PostDraft } from "@/lib/github";

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

const SUMMARY_SYSTEM_PROMPT =
  "你是中文博客编辑。请为给定文章正文生成一段 60-90 字的摘要，只输出摘要正文，不要加引号、前缀或解释。";

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
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summaryError, setSummaryError] = useState("");

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
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        showToast(data.error ?? "上传失败");
        return;
      }
      const kind: "image" | "video" | "file" = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file";
      insertMedia(data.url, kind, file.name);
    } catch {
      showToast("上传失败，请检查网络或 R2 配置");
    } finally {
      setUploading(false);
    }
  };

  /** 生成摘要：只写入预览，用户确认后才落到 summary 字段，正文永远不动。 */
  const generateSummary = async () => {
    if (summaryLoading || !aiReady) return;
    if (!body.trim()) {
      showToast("正文为空，无法生成摘要");
      return;
    }
    setSummaryLoading(true);
    setSummaryDraft("");
    setSummaryError("");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: body,
          system: SUMMARY_SYSTEM_PROMPT,
          maxTokens: 400,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        const message = data.error ?? "生成失败";
        setSummaryError(message);
        showToast(message);
        return;
      }
      if (!response.body) {
        setSummaryError("模型没有返回内容，请重试");
        showToast("模型没有返回内容，请重试");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setSummaryDraft(text.trim());
      }
      text += decoder.decode();
      const finalText = text.trim();
      if (!finalText) {
        setSummaryDraft("");
        setSummaryError("模型没有返回内容，请重试");
        showToast("模型没有返回内容，请重试");
        return;
      }
      setSummaryDraft(finalText);
    } catch (error) {
      const message =
        (error as { name?: string })?.name === "AbortError"
          ? "生成超时（120 秒），请稍后重试"
          : "生成失败，请稍后再试";
      setSummaryError(message);
      showToast(message);
    } finally {
      window.clearTimeout(timer);
      setSummaryLoading(false);
    }
  };

  const adoptSummary = () => {
    const value = summaryDraft.trim().slice(0, 200);
    if (!value) return;
    setSummary(value);
    markDirty();
    setSummaryDraft("");
    setSummaryError("");
    showToast("摘要已采纳，保存后生效");
  };

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
            className="st-btn w-9 h-9 rounded-lg flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink"
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
              className="st-btn px-3 py-2 rounded-lg text-xs font-sans text-smartisan-muted hover:text-smartisan-red flex items-center gap-1.5"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              删除
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="st-btn px-5 py-2.5 rounded-xl text-sm font-sans text-smartisan-ink flex items-center gap-2"
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
            <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              文章标题 · TITLE
            </span>
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
            <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              文件名 · SLUG
            </span>
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
            <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              发布日期 · DATE
            </span>
            <DateField
              value={date}
              onChange={(next) => {
                setDate(next);
                markDirty();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              分类 · CATEGORY
            </span>
            <CategoryField
              value={category}
              onChange={(next) => {
                setCategory(next);
                markDirty();
              }}
            />
          </div>

          <div className="space-y-1.5 lg:col-span-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                摘要 · SUMMARY
              </span>
              {aiReady ? (
                <button
                  type="button"
                  onClick={() => void generateSummary()}
                  disabled={summaryLoading}
                  className="st-btn px-2.5 py-1 rounded-lg text-[10px] font-sans text-smartisan-muted hover:text-smartisan-ink flex items-center gap-1 disabled:opacity-40"
                >
                  {summaryLoading ? (
                    <Loader2 size={10} className="animate-spin text-smartisan-red" />
                  ) : (
                    <Sparkles size={10} className="text-smartisan-gold" />
                  )}
                  {summaryLoading ? "生成中…" : "生成摘要"}
                </button>
              ) : null}
            </div>
            <input
              value={summary}
              onChange={(event) => {
                setSummary(event.target.value);
                markDirty();
              }}
              placeholder="一到两句话，会显示在卡片上"
              className="w-full bg-smartisan-sunken border border-smartisan-line rounded-lg px-3 py-2.5 text-sm font-sans text-smartisan-text placeholder:text-smartisan-faint outline-none focus:border-smartisan-red/50 transition"
            />

            {summaryLoading || summaryDraft || summaryError ? (
              <div className="st-well rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                    AI 摘要预览
                  </span>
                  <span className="font-mono text-[10px] text-smartisan-faint">
                    {summaryDraft.length} 字
                  </span>
                </div>
                <p
                  className={`text-xs font-sans leading-6 whitespace-pre-wrap ${
                    summaryError ? "text-smartisan-red" : "text-smartisan-text"
                  }`}
                >
                  {summaryError || summaryDraft || "正在生成…"}
                </p>
                {!summaryLoading && summaryDraft ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={adoptSummary}
                      className="st-btn px-3 py-1.5 rounded-lg text-[11px] font-sans text-smartisan-ink flex items-center gap-1"
                    >
                      <Check size={11} className="text-smartisan-gold" />
                      采用
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSummaryDraft("");
                        setSummaryError("");
                      }}
                      className="st-btn px-3 py-1.5 rounded-lg text-[11px] font-sans text-smartisan-muted hover:text-smartisan-ink"
                    >
                      取消
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* 编辑区 */}
      <section className="st-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-smartisan-hairline">
          <div className="flex items-center gap-1.5">
            {(["write", "preview"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  playMechanicalClick(800, 0.03);
                  setTab(key);
                }}
                className={`px-3 py-1.5 rounded-lg font-mono text-[11px] tracking-wide transition ${
                  tab === key
                    ? "bg-smartisan-red/10 text-smartisan-red border border-smartisan-red/30"
                    : "text-smartisan-muted hover:text-smartisan-ink border border-transparent"
                } ${key === "preview" ? "lg:hidden" : ""}`}
              >
                {key === "write" ? "编辑 EDIT" : "预览 PREVIEW"}
              </button>
            ))}
          </div>
          <div className="font-mono text-[10px] text-smartisan-muted tracking-wide">
            {body.length} 字符 · {readTime} MIN READ
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
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-smartisan-socket border border-smartisan-line text-smartisan-muted hover:text-smartisan-ink flex items-center justify-center"
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
                    className={`px-3 py-1.5 rounded-lg font-mono text-[10px] border transition ${
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
              className="st-btn mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-sans text-smartisan-ink"
            >
              插入到正文
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
