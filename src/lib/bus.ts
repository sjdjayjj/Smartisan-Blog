"use client";

/** 极简事件总线：让服务端组件里的按钮也能触发全局弹窗 / Toast。 */

export const OPEN_NOTE_EVENT = "smartisan:open-note";
export const TOAST_EVENT = "smartisan:toast";

export function openNoteModal(slug?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<string | undefined>(OPEN_NOTE_EVENT, { detail: slug })
  );
}

export function showToast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));
}
