"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Markdoc from "@markdoc/markdoc";
import { ArrowLeft, Check, Loader2, Save, Trash2 } from "lucide-react";
import MarkdocContent from "@/components/MarkdocContent";
import { DateField } from "@/components/account/SmartisanFields";
import { playMechanicalClick } from "@/lib/audio";
import { showToast } from "@/lib/bus";
import type { NoteDraft } from "@/lib/notes";

const DEFAULT_META = "即时随笔";
const DEFAULT_EYEBROW = "便签 · 即时事件";

function deriveSlug(title: string): string {
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

/** 便签是即时事件：字段极少，保存即生效，编辑区保持单屏可读。 */
export default function NoteEditor({
  initial,
  initialDraft = null,
}: {
  initial: NoteDraft | null;
  initialDraft?: string | null;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEditing = Boolean(initial);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [meta, setMeta] = useState(initial?.meta ?? DEFAULT_META);
  const [eyebrow, setEyebrow] = useState(initial?.eyebrow ?? DEFAULT_EYEBROW);
  const [body, setBody] = useState(initial?.body ?? initialDraft ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const previewNodes = useMemo(() => {
    try {
      return Markdoc.parse(body).children;
    } catch {
      return [];
    }
  }, [body]);

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
    setBody(body.slice(0, start) + `${before}${selected}${after}` + body.slice(end));
    markDirty();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + before.length + selected.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const save = async () => {
    if (saving) return;
    if (!title.trim()) {
      showToast("请填写便签标题");
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
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title, date, meta, eyebrow, body }),
      });
      const data = (await response.json()) as { ok?: boolean; slug?: string; error?: string };
      if (!response.ok) {
        showToast(data.error ?? "保存失败");
        return;
      }
      setDirty(false);
      showToast(isEditing ? "便签已更新" : "便签已贴上");
      if (!isEditing && data.slug) {
        router.replace(`/account/notes/editor?slug=${encodeURIComponent(data.slug)}`);
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
  }, [saving, title, slug, body, date, meta, eyebrow]);

  const remove = async () => {
    if (!initial || deleting) return;
    if (!window.confirm(`确定撕掉《${initial.title}》这张便签吗？此操作会直接提交到仓库。`)) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/notes?slug=${encodeURIComponent(initial.slug)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        showToast(data.error ?? "删除失败");
        return;
      }
      showToast("便签已删除");
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
            aria-label="返回工坊"
          >
            <ArrowLeft size={14} />
          </Link>
          <div className="min-w-0">
            <h1 className="font-serif text-lg sm:text-xl font-bold text-smartisan-ink truncate">
              {isEditing ? "编辑便签" : "新增便签"}
            </h1>
            <p className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              {isEditing ? `${initial?.slug}.mdoc` : "NEW NOTE"} · {dirty ? "UNSAVED" : "SYNCED"}
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
            {saving ? "提交中…" : isEditing ? "保存便签" : "贴上便签"}
          </button>
        </div>
      </div>

      {/* 元信息面板 */}
      <section className="st-card relative z-10 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <label className="lg:col-span-2 space-y-1.5 block">
            <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              便签标题 · TITLE
            </span>
            <input
              value={title}
              onChange={(event) => {
                const nextTitle = event.target.value;
                setTitle(nextTitle);
                if (!slugTouched && nextTitle) setSlug(deriveSlug(nextTitle));
                markDirty();
              }}
              placeholder="一句话闪念，也可以是一个长期追问"
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
              placeholder="instant-note"
              pattern="[a-zA-Z0-9-]+"
              className="w-full bg-smartisan-sunken border border-smartisan-line rounded-lg px-3 py-2.5 text-sm font-mono text-smartisan-gold placeholder:text-smartisan-faint outline-none focus:border-smartisan-red/50 transition"
            />
          </label>

          <div className="space-y-1.5">
            <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              贴上日期 · DATE
            </span>
            <DateField
              value={date}
              onChange={(next) => {
                setDate(next);
                markDirty();
              }}
            />
          </div>

          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              分类标签 · META
            </span>
            <input
              value={meta}
              onChange={(event) => {
                setMeta(event.target.value);
                markDirty();
              }}
              placeholder={DEFAULT_META}
              className="w-full bg-smartisan-sunken border border-smartisan-line rounded-lg px-3 py-2.5 text-xs font-mono text-smartisan-text placeholder:text-smartisan-faint outline-none focus:border-smartisan-red/50 transition"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              眉标 · EYEBROW
            </span>
            <input
              value={eyebrow}
              onChange={(event) => {
                setEyebrow(event.target.value);
                markDirty();
              }}
              placeholder={DEFAULT_EYEBROW}
              className="w-full bg-smartisan-sunken border border-smartisan-line rounded-lg px-3 py-2.5 text-xs font-mono text-smartisan-muted placeholder:text-smartisan-faint outline-none focus:border-smartisan-red/50 transition"
            />
          </label>
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
                {key === "write" ? "编辑 WRITE" : "预览 PREVIEW"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                { label: "加粗", before: "**", after: "**" },
                { label: "引用", before: "> ", after: "" },
                { label: "列表", before: "- ", after: "" },
                { label: "分隔", before: "\n---\n", after: "" },
              ] as const
            ).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => insertAtCursor(item.before, item.after ?? "")}
                className="px-2 py-1 rounded-md font-mono text-[10px] text-smartisan-muted hover:text-smartisan-ink hover:bg-smartisan-veil transition"
              >
                {item.label}
              </button>
            ))}
            <span className="ml-2 font-mono text-[10px] text-smartisan-muted tracking-wide">
              {body.length} 字符
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-2">
          <div className={`${tab === "preview" ? "hidden" : "block"} lg:block`}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-smartisan-hairline bg-smartisan-sunken">
              <span className="w-1.5 h-1.5 rounded-full bg-smartisan-red" />
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                Note Source
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
              placeholder={"写下此刻的想法…\n\n支持 **加粗**、> 引用、- 列表与 ![图片](地址)"}
              className="w-full min-h-[320px] lg:min-h-[460px] bg-smartisan-sunken px-4 py-4 font-mono text-[13px] leading-7 text-smartisan-text placeholder:text-smartisan-faint outline-none resize-y"
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
            <div className="min-h-[320px] lg:min-h-[460px] px-5 py-5 bg-smartisan-surface overflow-y-auto">
              {body.trim() ? (
                <div className="article-body">
                  <MarkdocContent nodes={previewNodes} />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-16">
                  <span className="st-seal text-[10px]">空白便签</span>
                  <p className="text-xs text-smartisan-muted font-sans">
                    左侧输入正文，这里会实时排版预览
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
