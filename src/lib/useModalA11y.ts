"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalA11yOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** 打开后优先聚焦的元素选择器，未命中时保持当前焦点 */
  autofocusSelector?: string;
  /** 关闭后是否把焦点还给打开前的元素，默认 true */
  shouldRestoreFocus?: () => boolean;
}

/**
 * 浮层通用可访问性：body 滚动锁定、Esc 关闭、Tab 焦点陷阱、关闭后焦点归还。
 * ArticleGrid、Navbar 抽屉与灵感侧板共用同一份实现，避免三处逻辑各自漂移。
 * 回调通过 ref 读取，因此父组件每次渲染传入新函数也不会反复重装监听。
 */
export function useModalA11y({
  open,
  containerRef,
  onClose,
  autofocusSelector,
  shouldRestoreFocus,
}: ModalA11yOptions) {
  const latest = useRef({ onClose, autofocusSelector, shouldRestoreFocus });
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // 每次渲染后同步最新回调，避免在渲染期间写 ref（React 19 会报错）
  useEffect(() => {
    latest.current = { onClose, autofocusSelector, shouldRestoreFocus };
  });

  useEffect(() => {
    if (!open) return;
    const node = containerRef.current;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => element.offsetParent !== null
      );

    if (latest.current.autofocusSelector) {
      node?.querySelector<HTMLElement>(latest.current.autofocusSelector)?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (latest.current.shouldRestoreFocus?.() ?? true) {
        restoreFocusRef.current?.focus();
      }
      restoreFocusRef.current = null;
    };
  }, [open, containerRef]);
}
