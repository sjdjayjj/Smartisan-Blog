"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lamp,
  List,
  Share2,
  X,
} from "lucide-react";
import MarkdocContent from "@/components/MarkdocContent";
import { playMechanicalClick } from "@/lib/audio";
import { showToast } from "@/lib/bus";
import { copyText } from "@/lib/clipboard";
import { categoryFilters, categoryMeta, type CategoryKey } from "@/lib/site";
import { useModalA11y } from "@/lib/useModalA11y";

export interface ArticleItem {
  slug: string;
  title: string;
  category: CategoryKey;
  date: string;
  summary: string;
  readTime: number;
}

const LAMP_STORAGE_KEY = "smartisan:lamp";
const READING_STORAGE_KEY = "smartisan:reading";
const POSITION_STORAGE_KEY = "smartisan:reading-position";
const POST_PARAM = "post";
const POST_PARAM_EVENT = "smartisan:post-param";

interface ReadingPrefs {
  size: number;
  leading: number;
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

type DocStatus = "idle" | "loading" | "ready" | "error";

type DocNode = {
  type?: string;
  attributes?: Record<string, unknown>;
  children?: DocNode[];
};

const DEFAULT_READING: ReadingPrefs = { size: 16, leading: 2 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDate(date: string) {
  return date.replaceAll("-", ".");
}

/** 与 MarkdocContent 的标题编号规则保持一致，才能让目录锚点命中正文。 */
function collectHeadings(nodes: unknown): HeadingItem[] {
  const list = Array.isArray(nodes) ? (nodes as DocNode[]) : [];
  const headings: HeadingItem[] = [];

  const textOf = (node: DocNode): string => {
    const type = node.type ?? "";
    if (type === "text" || type === "code") {
      const content = node.attributes?.content;
      return typeof content === "string" ? content : "";
    }
    if (type === "softbreak" || type === "hardbreak") return " ";
    return (node.children ?? []).map(textOf).join("");
  };

  const walk = (items: DocNode[]) => {
    for (const node of items) {
      if (node.type === "heading") {
        const level = Number(node.attributes?.level ?? 2);
        headings.push({
          id: `article-heading-${headings.length}`,
          level: level >= 4 ? 4 : level === 3 ? 3 : 2,
          text: (node.children ?? []).map(textOf).join("").trim(),
        });
        continue;
      }
      if (node.children?.length) walk(node.children);
    }
  };

  walk(list);
  return headings.filter((heading) => heading.text.length > 0);
}

function readPositions(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => typeof value === "number" && value >= 0 && value <= 1
      )
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function writePosition(slug: string, ratio: number) {
  try {
    const map = readPositions();
    delete map[slug];
    map[slug] = clamp(ratio, 0, 1);
    const keys = Object.keys(map);
    if (keys.length > 40) {
      for (const key of keys.slice(0, keys.length - 40)) delete map[key];
    }
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 隐私模式下写入失败时只保留本次会话状态
  }
}

/**
 * mode=push：用户点开文章时压入历史，移动端侧滑返回能关掉弹窗；
 * mode=replace：分享同步 / 关闭兜底 / 上下篇切换，不新增历史记录。
 */
function syncPostParam(slug: string | null, mode: "push" | "replace" = "replace") {
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set(POST_PARAM, slug);
  else url.searchParams.delete(POST_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "push") window.history.pushState({ [POST_PARAM]: slug }, "", next);
  else window.history.replaceState({ [POST_PARAM]: slug }, "", next);
  window.dispatchEvent(new Event(POST_PARAM_EVENT));
}

/** 文章弹窗的唯一状态源就是 URL，刷新与转发都能还原。 */
function subscribePostParam(listener: () => void) {
  const onChange = () => listener();
  window.addEventListener("popstate", onChange);
  window.addEventListener(POST_PARAM_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(POST_PARAM_EVENT, onChange);
  };
}

function getPostParam() {
  return new URLSearchParams(window.location.search).get(POST_PARAM) ?? "";
}

/** 由 slug 推导一个稳定的序列号，避免每次渲染都变化。 */
function serialOf(slug: string) {
  let hash = 0;
  for (let index = 0; index < slug.length; index += 1) {
    hash = (hash * 31 + slug.charCodeAt(index)) % 9973;
  }
  return `SN-2026-${String(1000 + (hash % 9000))}`;
}

export default function ArticleGrid({
  posts,
  degraded = false,
}: {
  posts: ArticleItem[];
  /** 远端内容源降级：列表仍可读，但需要给出非阻断提示 */
  degraded?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | CategoryKey>("all");
  const urlPost = useSyncExternalStore(subscribePostParam, getPostParam, () => "");
  const active = useMemo(
    () => (urlPost ? (posts.find((post) => post.slug === urlPost) ?? null) : null),
    [posts, urlPost]
  );

  // URL 里带着不存在的 slug 时无弹窗、参数还留在地址栏：提示一次并清掉脏参数
  const missingSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (!urlPost) {
      missingSlugRef.current = null;
      return;
    }
    if (posts.some((post) => post.slug === urlPost)) return;
    if (missingSlugRef.current === urlPost) return;
    missingSlugRef.current = urlPost;
    showToast("文章不存在或已删除");
    syncPostParam(null);
  }, [urlPost, posts]);
  const [lamp, setLamp] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(LAMP_STORAGE_KEY) === "on";
    } catch {
      return false;
    }
  });
  const [reading, setReading] = useState<ReadingPrefs>(() => {
    if (typeof window === "undefined") return DEFAULT_READING;
    try {
      const raw = window.localStorage.getItem(READING_STORAGE_KEY);
      if (!raw) return DEFAULT_READING;
      const parsed = JSON.parse(raw) as Partial<ReadingPrefs>;
      return {
        size:
          typeof parsed.size === "number"
            ? clamp(parsed.size, 14, 22)
            : DEFAULT_READING.size,
        leading:
          typeof parsed.leading === "number"
            ? clamp(parsed.leading, 1.5, 2.4)
            : DEFAULT_READING.leading,
      };
    } catch {
      return DEFAULT_READING;
    }
  });
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const pushedRef = useRef(false);
  const [tocOpen, setTocOpen] = useState(false);
  /** 正文按需加载：列表阶段只带摘要，打开弹窗时再取 AST */
  const [docs, setDocs] = useState<Record<string, unknown>>({});
  const [failedSlug, setFailedSlug] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? posts : posts.filter((post) => post.category === filter)),
    [filter, posts]
  );

  /** 已取到的正文按 slug 缓存，同一篇反复打开不再发请求；失败的文章等用户手动重试。 */
  useEffect(() => {
    if (!active) return;
    const slug = active.slug;
    if (docs[slug] !== undefined || failedSlug === slug) return;

    const controller = new AbortController();
    fetch(`/api/post/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ document?: unknown }>;
      })
      .then((payload) => {
        if (!Array.isArray(payload.document)) throw new Error("empty document");
        setDocs((current) => ({ ...current, [slug]: payload.document }));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailedSlug(slug);
      });

    return () => controller.abort();
  }, [active, docs, failedSlug]);

  const doc = active ? (docs[active.slug] ?? null) : null;
  const docStatus: DocStatus = !active
    ? "idle"
    : docs[active.slug] !== undefined
      ? "ready"
      : failedSlug === active.slug
        ? "error"
        : "loading";

  const headings = useMemo(() => collectHeadings(doc), [doc]);
  const postIndex = active ? posts.findIndex((post) => post.slug === active.slug) : -1;
  const prevPost = postIndex > 0 ? posts[postIndex - 1] : null;
  const nextPost =
    postIndex >= 0 && postIndex < posts.length - 1 ? posts[postIndex + 1] : null;

  const savePosition = () => {
    const node = dialogRef.current;
    // 正文还没到位时不记位置，否则会把「加载态」的高度当成阅读进度
    if (!node || !active || docStatus !== "ready") return;
    const max = node.scrollHeight - node.clientHeight;
    if (max <= 0) return;
    writePosition(active.slug, node.scrollTop / max);
  };

  const scheduleSavePosition = () => {
    if (saveTimerRef.current !== null) return;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      savePosition();
    }, 240);
  };

  const openArticle = (post: ArticleItem) => {
    playMechanicalClick(900, 0.04);
    setTocOpen(false);
    pushedRef.current = true;
    syncPostParam(post.slug, "push");
  };

  /** 关闭优先回退历史，让「完成阅读」与系统返回手势走同一条路径。 */
  const closeArticle = () => {
    savePosition();
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
      return;
    }
    syncPostParam(null);
  };

  const switchArticle = (post: ArticleItem) => {
    savePosition();
    playMechanicalClick(780, 0.03);
    setTocOpen(false);
    syncPostParam(post.slug);
  };

  useModalA11y({
    open: active !== null,
    containerRef: dialogRef,
    onClose: closeArticle,
    autofocusSelector: "[data-modal-autofocus]",
    // 切换上下篇时 URL 仍带 slug，此时不应把焦点甩回列表
    shouldRestoreFocus: () => !getPostParam(),
  });

  // 恢复上次阅读位置：以滚动比例记录，避免字号或内容变化导致错位。
  // 正文按需加载，必须等 doc 落地后再算，否则滚动高度还是加载态的高度。
  // 若正文含图片，首次恢复时图片尚未撑开高度，load 后再校正一次；用户手动滚动过就不再抢位置。
  useEffect(() => {
    if (!active || !doc) return;
    const node = dialogRef.current;
    if (!node) return;
    const ratio = readPositions()[active.slug] ?? 0;
    if (ratio <= 0) return;

    let cancelled = false;
    let userMoved = false;
    const markMoved = () => {
      userMoved = true;
    };
    const moveEvents = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
    moveEvents.forEach((event) =>
      node.addEventListener(event, markMoved, { passive: true })
    );

    const apply = () => {
      if (cancelled || userMoved) return;
      const max = node.scrollHeight - node.clientHeight;
      if (max > 0) node.scrollTop = ratio * max;
    };

    const frame = requestAnimationFrame(apply);
    const pendingImages = Array.from(node.querySelectorAll("img")).filter(
      (image) => !image.complete
    );
    pendingImages.forEach((image) =>
      image.addEventListener("load", apply, { once: true })
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      moveEvents.forEach((event) => node.removeEventListener(event, markMoved));
      pendingImages.forEach((image) => image.removeEventListener("load", apply));
    };
  }, [active, doc]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  // 浏览器前进/后退关闭弹窗时也落一次阅读位置
  useEffect(() => {
    if (!active) return;
    const onPopState = () => {
      const node = dialogRef.current;
      if (node) {
        const max = node.scrollHeight - node.clientHeight;
        if (max > 0) writePosition(active.slug, node.scrollTop / max);
      }
      if (!getPostParam()) pushedRef.current = false;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active]);

  const shareArticle = async () => {
    if (!active) return;
    playMechanicalClick(760, 0.03);
    syncPostParam(active.slug);
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: active.title, text: active.summary, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await copyText(url);
      showToast("文章链接已复制");
    } catch {
      showToast("链接复制失败，请手动复制地址栏");
    }
  };

  const jumpToHeading = (id: string) => {
    const node = dialogRef.current;
    const target = node?.querySelector<HTMLElement>(`#${id}`);
    if (!node || !target) return;
    playMechanicalClick(600, 0.03);
    // 用相对视口的距离计算，避免标题被嵌套容器改变 offsetParent 后跳错位置
    const top =
      target.getBoundingClientRect().top -
      node.getBoundingClientRect().top +
      node.scrollTop;
    node.scrollTo({ top: Math.max(0, top - 16), behavior: "smooth" });
    setTocOpen(false);
  };

  const toggleLamp = () => {
    playMechanicalClick(520, 0.03);
    setLamp((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(LAMP_STORAGE_KEY, next ? "on" : "off");
      } catch {
        // 写入失败时仅保留本次会话状态
      }
      return next;
    });
  };

  const updateReading = (patch: Partial<ReadingPrefs>) => {
    setReading((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 写入失败时仅保留本次会话状态
      }
      return next;
    });
  };

  const filterIndex = categoryFilters.findIndex((item) => item.key === filter);

  return (
    <section id="articles" className="space-y-6 scroll-mt-24">
      {/* 区块标题与筛选 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-smartisan-hairline pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-smartisan-gold shadow-gold-glow" />
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-smartisan-ink tracking-wider">
              九宫格文集 · Nine-Grid Archives
            </h2>
          </div>
          <p className="text-xs text-smartisan-muted font-sans mt-1">
            恪守工业秩序与严格网格对齐的文章矩阵
          </p>
        </div>

        <div className="st-well flex items-center gap-2.5 rounded-xl p-1.5 pl-2 pr-2">
          <div
            className="tuner-knob dial-knurl"
            style={{ transform: `rotate(${(Math.max(0, filterIndex) - 1.5) * 24}deg)` }}
            aria-hidden="true"
          >
            <span className="tuner-knob-core" />
            <span className="tuner-knob-pointer" />
          </div>
          <div className="flex flex-wrap gap-2">
            {categoryFilters.map((item) => {
              const isActive = filter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  aria-pressed={isActive}
                  className={`category-btn st-btn tap-40-y relative inline-flex items-center min-h-8 px-3 rounded-md text-[11px] font-sans transition ${
                    isActive
                      ? "text-smartisan-ink border-smartisan-red/50"
                      : "text-smartisan-muted"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 远端源降级提示：不阻断阅读，只说明当前内容可能不是最新 */}
      {degraded ? (
        <div
          role="status"
          className="st-well rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs font-sans text-smartisan-text"
        >
          <AlertTriangle size={13} className="text-smartisan-gold shrink-0" />
          <span className="min-w-0">
            远端内容源暂时不可用，当前展示的可能是本地缓存，内容未必是最新版本。
          </span>
        </div>
      ) : null}

      {/* 九宫格卡片 */}
      {visible.length === 0 ? (
        <div className="st-well rounded-xl p-10 text-center text-sm text-smartisan-muted font-sans">
          这个分类下还没有文章。前往{" "}
          <Link href="/account/editor" className="text-smartisan-gold underline underline-offset-4">
            作者工坊
          </Link>{" "}
          写下第一篇。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((post) => {
            const meta = categoryMeta[post.category] ?? categoryMeta.thinking;
            return (
              <article
                key={post.slug}
                className="article-item st-card relative rounded-xl p-5 flex flex-col justify-between group"
              >
                {/* 真实 button 承载点击：屏幕阅读器只读一次「阅读文章」，不会再 "按钮 按钮 标题" */}
                <button
                  type="button"
                  onClick={() => openArticle(post)}
                  aria-label={`阅读文章：${post.title}`}
                  className="absolute inset-0 z-10 rounded-xl cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-smartisan-red/60"
                />
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded ${meta.badgeClass}`}
                    >
                      {meta.badge}
                    </span>
                    <span className="font-mono text-[11px] text-smartisan-muted whitespace-nowrap">
                      {post.readTime} MIN READ
                    </span>
                  </div>

                  <h3 className="font-serif text-lg font-bold text-smartisan-ink group-hover:text-smartisan-gold transition leading-snug line-clamp-2">
                    {post.title}
                  </h3>

                  <p className="text-xs text-smartisan-muted font-sans leading-relaxed line-clamp-3">
                    {post.summary}
                  </p>
                </div>

                <div className="st-plate -mx-5 -mb-5 mt-6 px-4 py-2.5 rounded-b-xl flex items-center justify-between font-mono text-[11px]">
                  <span className="plate-screw plate-screw-tl" aria-hidden="true" />
                  <span className="plate-screw plate-screw-tr" aria-hidden="true" />
                  <span className="plate-screw plate-screw-bl" aria-hidden="true" />
                  <span className="plate-screw plate-screw-br" aria-hidden="true" />
                  <span className="text-smartisan-faint tracking-widest">
                    {formatDate(post.date)}
                  </span>
                  <span className="flex items-center gap-2.5 text-smartisan-faint tracking-wider">
                    {serialOf(post.slug)}
                    <span className="group-hover:translate-x-1 transition text-smartisan-text flex items-center gap-1">
                      阅读全文
                      <ArrowRight size={11} className="text-smartisan-red" />
                    </span>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 文章阅读弹窗 */}
      {active && (
        <div
          className="fixed inset-0 z-50 bg-smartisan-scrim backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
          onClick={closeArticle}
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
        >
          <div
            ref={dialogRef}
            onScroll={scheduleSavePosition}
            className="max-w-2xl w-full st-dialog-max overflow-y-auto st-card rounded-2xl p-6 sm:p-8 border border-smartisan-line-strong relative animate-scaleUp"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              data-modal-autofocus
              onClick={closeArticle}
              aria-label="关闭文章"
              className="tap-44 absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-smartisan-socket border border-smartisan-line text-smartisan-muted hover:text-smartisan-ink flex items-center justify-center shadow-lg"
            >
              <X size={14} />
            </button>

            <div className="flex gap-5">
              <div className="flex-1 min-w-0 space-y-6">
                <div className="pr-12">
                  <span
                    className={`font-mono text-xs px-2 py-0.5 rounded ${
                      (categoryMeta[active.category] ?? categoryMeta.thinking).badgeClass
                    }`}
                  >
                    {(categoryMeta[active.category] ?? categoryMeta.thinking).badge}
                  </span>
                  <h2 className="font-serif text-2xl sm:text-3xl font-bold text-smartisan-ink mt-3 leading-snug">
                    {active.title}
                  </h2>
                  <div className="flex items-center gap-3 font-mono text-xs text-smartisan-muted mt-2">
                    <span>{formatDate(active.date)}</span>
                    <span>•</span>
                    <span>{active.readTime} MIN READ</span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={toggleLamp}
                      aria-pressed={lamp}
                      title="将正文切换为米白纸质阅读态"
                      className="tap-44-y relative st-btn inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-sans text-smartisan-muted hover:text-smartisan-ink"
                    >
                      <Lamp
                        size={12}
                        className={lamp ? "text-smartisan-gold" : "text-smartisan-muted"}
                      />
                      {lamp ? "阅读灯已点亮" : "点亮阅读灯"}
                    </button>

                    {/* 游标卡尺：字号与行距微调 */}
                    <div className="caliper">
                      <label className="caliper-readout" htmlFor="reading-size">
                        字号 <b>{reading.size}</b> PX
                      </label>
                      <input
                        id="reading-size"
                        type="range"
                        min={14}
                        max={22}
                        step={1}
                        value={reading.size}
                        onChange={(event) =>
                          updateReading({ size: Number(event.target.value) })
                        }
                        aria-label="正文字号"
                        className="caliper-range"
                      />
                      <label className="caliper-readout" htmlFor="reading-leading">
                        行距 <b>{reading.leading.toFixed(1)}</b>
                      </label>
                      <input
                        id="reading-leading"
                        type="range"
                        min={1.5}
                        max={2.4}
                        step={0.1}
                        value={reading.leading}
                        onChange={(event) =>
                          updateReading({ leading: Number(event.target.value) })
                        }
                        aria-label="正文行距"
                        className="caliper-range"
                      />
                    </div>
                  </div>
                </div>

                {/* 细红线分割 */}
                <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-smartisan-red to-transparent shadow-red-glow" />

                {headings.length > 0 ? (
                  <div className="st-well rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setTocOpen((value) => !value)}
                      aria-expanded={tocOpen}
                      className="w-full min-h-11 flex items-center justify-between px-3.5 py-2.5 text-[11px] font-mono text-smartisan-muted hover:text-smartisan-ink transition"
                    >
                      <span className="flex items-center gap-2 tracking-widest">
                        <List size={12} className="text-smartisan-gold" />
                        目录 · CONTENTS
                      </span>
                      <span className="flex items-center gap-2">
                        {String(headings.length).padStart(2, "0")}
                        <ChevronDown
                          size={12}
                          className={`transition-transform ${tocOpen ? "rotate-180" : ""}`}
                        />
                      </span>
                    </button>
                    {tocOpen ? (
                      <nav
                        aria-label="文章目录"
                        className="border-t border-smartisan-line px-2 py-2 max-h-56 overflow-y-auto st-scroll-contain"
                      >
                        {headings.map((heading) => (
                          <button
                            key={heading.id}
                            type="button"
                            onClick={() => jumpToHeading(heading.id)}
                            className={`flex w-full items-center min-h-11 text-left rounded-md py-1.5 pr-2 text-xs font-serif text-smartisan-text hover:bg-smartisan-veil hover:text-smartisan-ink transition ${
                              heading.level >= 4
                                ? "pl-7"
                                : heading.level === 3
                                  ? "pl-5"
                                  : "pl-2.5 font-bold"
                            }`}
                          >
                            {heading.text}
                          </button>
                        ))}
                      </nav>
                    ) : null}
                  </div>
                ) : null}

                {docStatus === "error" ? (
                  <div className="st-well rounded-xl p-6 text-center space-y-3" role="alert">
                    <p className="font-mono text-[11px] tracking-widest text-smartisan-gold">
                      LOAD FAILED · 正文加载失败
                    </p>
                    <p className="text-sm font-sans text-smartisan-text">
                      网络似乎不太顺利，正文没有取到。检查连接后可以重试。
                    </p>
                    <button
                      type="button"
                      onClick={() => setFailedSlug(null)}
                      className="st-btn tap-44-y relative inline-flex items-center px-4 py-2 rounded-lg text-xs font-sans text-smartisan-ink"
                    >
                      重新加载
                    </button>
                  </div>
                ) : doc ? (
                  <div
                    className={`article-body rounded-xl ${
                      lamp ? "reading-lamp p-5 sm:p-6" : ""
                    }`}
                    style={{ fontSize: `${reading.size}px`, lineHeight: reading.leading }}
                  >
                    <MarkdocContent nodes={doc} headingIds />
                  </div>
                ) : (
                  // 正文按需加载：用现有凹槽质感占位，避免弹窗出现空白
                  <div className="st-well rounded-xl p-6 space-y-3" aria-busy="true" aria-live="polite">
                    <p className="font-mono text-[11px] tracking-widest text-smartisan-muted">
                      LOADING · 正文加载中
                    </p>
                    <div className="animate-pulse space-y-2" aria-hidden="true">
                      <span className="block h-2.5 w-11/12 rounded-full bg-smartisan-veil" />
                      <span className="block h-2.5 w-full rounded-full bg-smartisan-veil" />
                      <span className="block h-2.5 w-4/5 rounded-full bg-smartisan-veil" />
                    </div>
                  </div>
                )}

                {prevPost || nextPost ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={!prevPost}
                      onClick={() => prevPost && switchArticle(prevPost)}
                      className="tap-44-y relative st-btn min-w-0 px-3 py-2 rounded-lg text-[11px] font-sans text-smartisan-muted hover:text-smartisan-ink flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <ChevronLeft size={12} className="shrink-0 text-smartisan-gold" />
                      <span className="truncate">
                        {prevPost ? `上一篇 · ${prevPost.title}` : "已是第一篇"}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={!nextPost}
                      onClick={() => nextPost && switchArticle(nextPost)}
                      className="tap-44-y relative st-btn min-w-0 px-3 py-2 rounded-lg text-[11px] font-sans text-smartisan-muted hover:text-smartisan-ink flex items-center justify-end gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <span className="truncate">
                        {nextPost ? `下一篇 · ${nextPost.title}` : "已经是最后一篇"}
                      </span>
                      <ChevronRight size={12} className="shrink-0 text-smartisan-gold" />
                    </button>
                  </div>
                ) : null}

                <div className="pt-6 border-t border-smartisan-line flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-smartisan-muted">
                  <span>THE CRAFTSMAN BLOG</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={shareArticle}
                      className="tap-44-y relative st-btn px-4 py-2 rounded-lg text-smartisan-text hover:text-smartisan-ink flex items-center gap-2"
                    >
                      <Share2 size={12} className="text-smartisan-red" />
                      分享本文
                    </button>
                    <button
                      type="button"
                      onClick={closeArticle}
                      className="tap-44-y relative st-btn px-4 py-2 rounded-lg text-smartisan-ink"
                    >
                      完成阅读
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
