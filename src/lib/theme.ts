"use client";

/**
 * 主题状态层：深浅两套拟物主题的唯一数据源。
 *
 * - 首屏由 layout 里的阻塞脚本写入 `data-theme`，因此这里读取的是“已经生效”的值，
 *   服务端快照固定为 dark，与脚本默认值一致，不会产生水合不一致。
 * - 偏好写入 localStorage（`smartisan:theme`），并监听 storage 事件做多标签页同步。
 * - 切换时优先使用 View Transitions 做交叉淡入，不支持时退回极短的全局色彩过渡。
 */

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "smartisan:theme";
export const DEFAULT_THEME: Theme = "dark";
const THEME_COLOR: Record<Theme, string> = {
  dark: "#141416",
  light: "#eae6dd",
};

const listeners = new Set<() => void>();
let current: Theme = DEFAULT_THEME;
let loaded = false;

function normalize(value: unknown): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

function systemTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** 首次调用时恢复到“页面实际生效”的主题，SSR 阶段直接跳过。 */
function loadTheme(): Theme {
  if (loaded || typeof window === "undefined") return current;
  loaded = true;
  const applied = normalize(document.documentElement.dataset.theme);
  if (applied) {
    current = applied;
    return current;
  }
  try {
    current = normalize(window.localStorage.getItem(THEME_STORAGE_KEY)) ?? systemTheme();
  } catch {
    current = systemTheme();
  }
  return current;
}

/** 把主题落到 DOM：属性、原生控件配色、浏览器地址栏色，缺一不可。 */
function applyToDocument(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[theme];
}

function emit() {
  listeners.forEach((listener) => listener());
}

/** 供 useSyncExternalStore 订阅主题变化 */
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getThemeSnapshot(): Theme {
  return loadTheme();
}

/** 服务端与首屏默认值：与 index.html 的初始 data-theme 保持一致 */
export function getServerThemeSnapshot(): Theme {
  return DEFAULT_THEME;
}

export function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

/** 切换主题：带过渡、带持久化、带跨标签页同步。 */
export function setTheme(theme: Theme, options: { animate?: boolean } = {}) {
  const animate = options.animate ?? true;
  loadTheme();

  const commit = () => {
    current = theme;
    applyToDocument(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // 隐私模式下写入失败时只保留本次会话状态
    }
    emit();
  };

  if (!animate || prefersReducedMotion()) {
    commit();
    return;
  }

  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(commit);
    return;
  }

  // 兜底：短促的全局色彩过渡，结束后立刻摘掉，避免干扰常规交互动效
  const root = document.documentElement;
  root.classList.add("theme-switching");
  commit();
  window.setTimeout(() => root.classList.remove("theme-switching"), 360);
}

export function toggleTheme(options: { animate?: boolean } = {}) {
  setTheme(getThemeSnapshot() === "dark" ? "light" : "dark", options);
}

// 客户端首次加载即同步内存状态（脚本已提前把主题写进 DOM）
if (typeof window !== "undefined") {
  loadTheme();

  // 多标签页同步：另一页切换主题时，本页跟随但不重复写回 storage
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const next = normalize(event.newValue) ?? DEFAULT_THEME;
    if (next === current) return;
    current = next;
    applyToDocument(next);
    emit();
  });
}
