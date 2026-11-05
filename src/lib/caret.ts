/**
 * textarea 光标坐标：用镜像元素复刻字体与换行规则，把字符偏移换算成视口坐标。
 * 用于把选区改写工具条定位到选区附近，不依赖第三方库。
 */

export interface CaretRect {
  left: number;
  top: number;
  bottom: number;
  height: number;
}

const COPY_PROPERTIES = [
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontFamily",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textIndent",
  "textTransform",
  "textAlign",
  "whiteSpace",
  "wordWrap",
  "tabSize",
  "direction",
] as const;

function kebab(property: string): string {
  return property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

export function textareaCaretRect(
  textarea: HTMLTextAreaElement,
  position: number
): CaretRect | null {
  if (typeof document === "undefined") return null;

  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");

  for (const property of COPY_PROPERTIES) {
    mirror.style.setProperty(kebab(property), computed.getPropertyValue(kebab(property)));
  }
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.top = "0";
  mirror.style.left = "-99999px";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflow = "hidden";

  const clamped = Math.max(0, Math.min(position, textarea.value.length));
  mirror.textContent = textarea.value.slice(0, clamped);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const box = textarea.getBoundingClientRect();
  const mirrorBox = mirror.getBoundingClientRect();
  const markerBox = marker.getBoundingClientRect();

  document.body.removeChild(mirror);

  const left = box.left + (markerBox.left - mirrorBox.left) - textarea.scrollLeft;
  const top = box.top + (markerBox.top - mirrorBox.top) - textarea.scrollTop;

  return {
    left,
    top,
    bottom: top + (markerBox.height || parseFloat(computed.lineHeight) || 20),
    height: markerBox.height || parseFloat(computed.lineHeight) || 20,
  };
}
