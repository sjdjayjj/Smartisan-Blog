"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, ChevronDown, Lamp, List, Share2 } from "lucide-react";
import ArticleBody from "@/components/ArticleBody";
import { collectHeadings } from "@/lib/headings";
import { playMechanicalClick } from "@/lib/audio";
import { showToast } from "@/lib/bus";
import { copyText } from "@/lib/clipboard";

const LAMP_STORAGE_KEY = "smartisan:lamp";
const READING_STORAGE_KEY = "smartisan:reading";
const POSITION_STORAGE_KEY = "smartisan:reading-position";

interface ReadingPrefs {
  size: number;
  leading: number;
}

const DEFAULT_READING: ReadingPrefs = { size: 16, leading: 2 };

interface ReaderPrefs {
  lamp: boolean;
  reading: ReadingPrefs;
}

const SERVER_PREFS: ReaderPrefs = { lamp: false, reading: DEFAULT_READING };

// 阅读偏好放在模块级 store 中：useSyncExternalStore 在 hydration 时使用
// server snapshot，避免「effect 里 setState」导致首屏闪动与 hydration mismatch。
const prefListeners = new Set<() => void>();
let prefSnapshot: ReaderPrefs | null = null;

function readPrefs(): ReaderPrefs {
  if (prefSnapshot) return prefSnapshot;
  let lamp = false;
  let reading = DEFAULT_READING;
  try {
    lamp = window.localStorage.getItem(LAMP_STORAGE_KEY) === "on";
    const raw = window.localStorage.getItem(READING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReadingPrefs>;
      reading = {
        size:
          typeof parsed.size === "number"
            ? clamp(parsed.size, 14, 22)
            : DEFAULT_READING.size,
        leading:
          typeof parsed.leading === "number"
            ? clamp(parsed.leading, 1.5, 2.4)
            : DEFAULT_READING.leading,
      };
    }
  } catch {
    // 读不到偏好时使用默认值
  }
  prefSnapshot = { lamp, reading };
  return prefSnapshot;
}

function subscribePrefs(listener: () => void) {
  prefListeners.add(listener);
  return () => {
    prefListeners.delete(listener);
  };
}

function writePrefs(next: ReaderPrefs) {
  prefSnapshot = next;
  try {
    window.localStorage.setItem(LAMP_STORAGE_KEY, next.lamp ? "on" : "off");
    window.localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(next.reading));
  } catch {
    // 隐私模式下写入失败时仅保留本次会话状态
  }
  prefListeners.forEach((listener) => listener());
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
 * 独立页阅读器：给 /post/[slug] 补齐与弹窗一致的阅读能力。
 * 正文仍由服务端渲染（ArticleBody 在本组件内输出，禁用 JS 也能读到全文），
 * 这里只接管字号/行距、阅读灯、目录跳转、位置记忆与回顶。
 * 阅读偏好与弹窗共用 localStorage key，两处体验保持一致。
 */
export default function PostReader({
  slug,
  title,
  summary,
  nodes,
}: {
  slug: string;
  title: string;
  summary: string;
  nodes: unknown;
}) {
  const prefs = useSyncExternalStore(subscribePrefs, readPrefs, () => SERVER_PREFS);
  const { lamp, reading } = prefs;
  const [tocOpen, setTocOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

  const headings = useMemo(() => collectHeadings(nodes), [nodes]);

  // 恢复上次阅读位置：按整页滚动比例记录，字号或内容变化后仍能对上
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash) return; // 带锚点直达时优先尊重锚点
    const ratio = readPositions()[slug] ?? 0;
    if (ratio <= 0) return;

    let cancelled = false;
    let userMoved = false;
    const markMoved = () => {
      userMoved = true;
    };
    const moveEvents = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
    moveEvents.forEach((event) =>
      window.addEventListener(event, markMoved, { passive: true })
    );

    const apply = () => {
      if (cancelled || userMoved) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0) window.scrollTo(0, ratio * max);
    };

    const frame = requestAnimationFrame(apply);
    const pendingImages = Array.from(document.querySelectorAll(".article-body img")).filter(
      (image) => !(image as HTMLImageElement).complete
    );
    pendingImages.forEach((image) =>
      image.addEventListener("load", apply, { once: true })
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      moveEvents.forEach((event) => window.removeEventListener(event, markMoved));
      pendingImages.forEach((image) => image.removeEventListener("load", apply));
    };
  }, [slug]);

  // 位置记忆 + 回顶按钮显隐
  useEffect(() => {
    const save = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0) writePosition(slug, window.scrollY / max);
    };
    const onScroll = () => {
      setShowTop(window.scrollY > 400);
      if (saveTimerRef.current !== null) return;
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        save();
      }, 240);
    };
    const onPageHide = () => save();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      save();
    };
  }, [slug]);

  const toggleLamp = () => {
    playMechanicalClick(520, 0.03);
    writePrefs({ ...prefs, lamp: !prefs.lamp });
  };

  const updateReading = (patch: Partial<ReadingPrefs>) => {
    writePrefs({ ...prefs, reading: { ...prefs.reading, ...patch } });
  };

  const jumpToHeading = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return; // 没有 JS 时保留原生锚点行为
    event.preventDefault();
    playMechanicalClick(600, 0.03);
    const top = target.getBoundingClientRect().top + window.scrollY - 24;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    window.history.replaceState(null, "", `#${id}`);
  };

  const shareArticle = async () => {
    playMechanicalClick(760, 0.03);
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: summary, url });
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

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={toggleLamp}
          aria-pressed={lamp}
          title="将正文切换为米白纸质阅读态"
          className="tap-44-y relative st-btn st-btn-sm st-btn-pill inline-flex items-center gap-2 font-sans text-smartisan-muted hover:text-smartisan-ink"
        >
          <Lamp size={12} className={lamp ? "text-smartisan-gold" : "text-smartisan-muted"} />
          {lamp ? "阅读灯已点亮" : "点亮阅读灯"}
        </button>

        {/* 游标卡尺：与弹窗同款字号/行距微调 */}
        <div className="caliper">
          <label className="caliper-readout" htmlFor="post-reading-size">
            字号 <b>{reading.size}</b> PX
          </label>
          <input
            id="post-reading-size"
            type="range"
            min={14}
            max={22}
            step={1}
            value={reading.size}
            onChange={(event) => updateReading({ size: Number(event.target.value) })}
            aria-label="正文字号"
            className="caliper-range"
          />
          <label className="caliper-readout" htmlFor="post-reading-leading">
            行距 <b>{reading.leading.toFixed(1)}</b>
          </label>
          <input
            id="post-reading-leading"
            type="range"
            min={1.5}
            max={2.4}
            step={0.1}
            value={reading.leading}
            onChange={(event) => updateReading({ leading: Number(event.target.value) })}
            aria-label="正文行距"
            className="caliper-range"
          />
        </div>

        <button
          type="button"
          onClick={shareArticle}
          className="tap-44-y relative st-btn st-btn-sm st-btn-pill inline-flex items-center gap-2 font-sans text-smartisan-muted hover:text-smartisan-ink"
        >
          <Share2 size={12} className="text-smartisan-red" />
          分享本文
        </button>
      </div>

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
          <nav
            aria-label="文章目录"
            className={`border-t border-smartisan-line px-2 py-2 overflow-y-auto st-scroll-contain ${
              tocOpen ? "max-h-56" : "hidden"
            }`}
          >
            {headings.map((heading) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                onClick={(event) => jumpToHeading(event, heading.id)}
                className={`flex w-full items-center min-h-11 rounded-md py-1.5 pr-2 text-xs font-serif text-smartisan-text hover:bg-smartisan-veil hover:text-smartisan-ink transition ${
                  heading.level >= 4
                    ? "pl-7"
                    : heading.level === 3
                      ? "pl-5"
                      : "pl-2.5 font-bold"
                }`}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </div>
      ) : null}

      <ArticleBody
        nodes={nodes}
        lamp={lamp}
        size={reading.size}
        leading={reading.leading}
      />

      <button
        type="button"
        onClick={() => {
          playMechanicalClick(600, 0.03);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        aria-label="回到顶部"
        className={`tap-44 fixed bottom-5 right-5 z-40 st-btn-icon-lg st-btn st-btn-pill border border-smartisan-line-strong text-smartisan-ink flex items-center justify-center shadow-lg transition-opacity duration-200 ${
          showTop ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <ArrowUp size={14} />
      </button>
    </section>
  );
}
