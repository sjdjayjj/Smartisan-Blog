"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type AnchorGetter = () => AnchorRect | null;

const MARGIN = 12;
const PANEL_WIDTH = 440;
const TOOLBAR_WIDTH = 300;
const EXIT_MS = 140;

/** 复用现有 .st-popover / .st-card / .st-btn，不引入新的视觉体系。 */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return mobile;
}

/**
 * 关闭时先播 140ms 退场动画，再通知父级卸载。
 * 不用 effect 同步 state，避免级联渲染。
 */
function usePresence(
  open: boolean,
  onClose: () => void
): { visible: boolean; closing: boolean; requestClose: () => void } {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setClosing(false);
      onClose();
    }, EXIT_MS);
  }, [closing, onClose]);

  return { visible: open || closing, closing, requestClose };
}

function useAnchoredStyle(
  getAnchor: AnchorGetter | undefined,
  enabled: boolean,
  width: number,
  preferBelow: boolean
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!enabled || !getAnchor) return;
    let frame = 0;

    const update = () => {
      const anchor = getAnchor();
      if (!anchor) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const finalWidth = Math.min(width, viewportWidth - MARGIN * 2);
      const left = Math.max(
        MARGIN,
        Math.min(anchor.left, viewportWidth - finalWidth - MARGIN)
      );

      if (preferBelow) {
        const top = Math.min(
          Math.max(anchor.bottom + 8, MARGIN),
          viewportHeight - 80
        );
        setStyle({ left, width: finalWidth, top });
        return;
      }

      if (anchor.top > viewportHeight / 2) {
        // 锚点偏下：向上展开，避免浮层被视口底部裁掉
        setStyle({ left, width: finalWidth, bottom: viewportHeight - anchor.top + 8 });
      } else {
        setStyle({ left, width: finalWidth, top: anchor.bottom + 8 });
      }
    };

    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [enabled, getAnchor, width, preferBelow]);

  return style;
}

function useDismiss(
  enabled: boolean,
  panelRef: RefObject<HTMLElement | null>,
  ignoreRef: RefObject<HTMLElement | null> | undefined,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (ignoreRef?.current?.contains(target)) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, panelRef, ignoreRef, onDismiss]);
}

function Header({
  title,
  meta,
  onClose,
}: {
  title: string;
  meta?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 h-10 border-b border-smartisan-hairline shrink-0">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-smartisan-red shrink-0" />
        <span className="font-serif text-[13px] font-bold text-smartisan-ink truncate">
          {title}
        </span>
        {meta ? (
          <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase truncate">
            {meta}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="st-btn w-6 h-6 rounded-md flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink shrink-0"
      >
        <X size={11} />
      </button>
    </div>
  );
}

export function AiFloat({
  open,
  onClose,
  title,
  meta,
  anchorRef,
  getAnchor,
  ignoreRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  meta?: string;
  anchorRef?: RefObject<HTMLElement | null>;
  getAnchor?: AnchorGetter;
  ignoreRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const { visible, closing, requestClose } = usePresence(open, onClose);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const resolve = useCallback<AnchorGetter>(() => {
    if (getAnchor) return getAnchor();
    const element = anchorRef?.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }, [anchorRef, getAnchor]);

  const style = useAnchoredStyle(resolve, mounted && visible && !mobile, PANEL_WIDTH, false);

  useDismiss(mounted && visible && !closing, panelRef, ignoreRef, requestClose);

  if (!mounted || !visible) return null;

  if (mobile) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end">
        <button
          type="button"
          aria-label="关闭浮层"
          onClick={requestClose}
          className="absolute inset-0 bg-smartisan-scrim-soft animate-fadeIn cursor-default"
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`relative w-full st-card rounded-t-2xl border-b-0 flex flex-col ${
            closing ? "st-ai-sheet-out" : "st-ai-sheet"
          }`}
          style={{ maxHeight: "60vh", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <Header title={title} meta={meta} onClose={requestClose} />
          <div className="min-h-0 overflow-y-auto px-4 py-3">{children}</div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      className={`fixed z-50 st-popover rounded-xl flex flex-col overflow-hidden ${
        closing ? "st-ai-pop-out" : "st-ai-pop"
      }`}
      style={{ ...style, maxHeight: "40vh" }}
    >
      <Header title={title} meta={meta} onClose={requestClose} />
      <div className="min-h-0 overflow-y-auto px-3.5 py-3">{children}</div>
    </div>,
    document.body
  );
}

/** 选区附近的小工具条：桌面锚定选区，移动端贴底，避免小屏遮挡正文。 */
export function AiToolbar({
  open,
  onClose,
  getAnchor,
  ignoreRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  getAnchor: AnchorGetter;
  ignoreRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const { visible, closing, requestClose } = usePresence(open, onClose);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const style = useAnchoredStyle(getAnchor, mounted && visible && !mobile, TOOLBAR_WIDTH, true);

  useDismiss(mounted && visible && !closing, barRef, ignoreRef, requestClose);

  if (!mounted || !visible) return null;

  if (mobile) {
    return createPortal(
      <div className="fixed inset-x-0 bottom-0 z-50 p-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <div
          ref={barRef}
          role="dialog"
          aria-label="选区改写"
          className={`st-popover rounded-xl p-1 flex items-center justify-center gap-1 ${
            closing ? "st-ai-pop-out" : "st-ai-pop"
          }`}
        >
          {children}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={barRef}
      role="dialog"
      aria-label="选区改写"
      className={`fixed z-50 st-popover rounded-lg p-1 flex items-center gap-1 ${
        closing ? "st-ai-pop-out" : "st-ai-pop"
      }`}
      style={style}
    >
      {children}
    </div>,
    document.body
  );
}
