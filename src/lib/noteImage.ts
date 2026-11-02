import type { NoteShare } from "@/lib/notes";
import { site } from "@/lib/site";
import { drawWaxSeal } from "@/lib/waxSealCanvas";

/**
 * 把便签渲染成一张 750px 宽的分享长图，纯 Canvas 绘制：
 * 不依赖 DOM 截图库，避免字体加载与跨域图片带来的不确定性。
 */

const WIDTH = 750;
const PAD = 64;
const BODY_LINE_HEIGHT = 44;
const TITLE_LINE_HEIGHT = 50;

/**
 * 长图配色跟随当前主题：浅色导出成暖纸质，深色保持暗室纸。
 * 色值与 globals.css 的浅色覆盖一一对应，避免导出物与页面观感脱节。
 */
const PALETTES = {
  dark: {
    paperTop: "#262930",
    paperBottom: "#1b1d22",
    grid: "rgba(255,255,255,0.03)",
    eyebrow: "#c5a059",
    hairline: "rgba(255,255,255,0.18)",
    title: "#ffffff",
    meta: "#8e8e93",
    body: "#e2e2e6",
    footerLine: "rgba(255,255,255,0.1)",
    footerText: "#8e8e93",
    footnote: "rgba(255,255,255,0.22)",
  },
  light: {
    paperTop: "#fdfaf1",
    paperBottom: "#f4eee0",
    grid: "rgba(0,0,0,0.05)",
    eyebrow: "#7d6222",
    hairline: "rgba(0,0,0,0.14)",
    title: "#17150f",
    meta: "#6f6a60",
    body: "#33302a",
    footerLine: "rgba(0,0,0,0.12)",
    footerText: "#6f6a60",
    footnote: "rgba(35,35,31,0.35)",
  },
} as const;

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of Array.from(text)) {
    const next = current + char;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char.trimStart();
    } else {
      current = next;
    }
  }
  if (current.trim()) lines.push(current);
  return lines.length ? lines : [""];
}

export type NoteImageOutcome =
  | { mode: "share" }
  | { mode: "preview"; url: string; filename: string }
  | { mode: "download" };

/** 触屏设备没有可靠的下载语义，改用「长按图片保存」预览层。 */
function isTouchDevice() {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

export async function exportNoteImage(note: NoteShare): Promise<NoteImageOutcome> {
  if (typeof document === "undefined") throw new Error("仅支持浏览器环境");
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");

  const palette =
    document.documentElement.dataset.theme === "light" ? PALETTES.light : PALETTES.dark;

  const contentWidth = WIDTH - PAD * 2;
  const titleFont = '700 36px "Noto Serif SC", "Songti SC", serif';
  const bodyFont = '500 26px "Noto Serif SC", "Songti SC", serif';
  const monoFont = '500 14px "Roboto Mono", Consolas, monospace';

  ctx.font = titleFont;
  const titleLines = wrapText(ctx, note.title, contentWidth);

  ctx.font = bodyFont;
  const paragraphs = note.paragraphs.map((paragraph) => wrapText(ctx, paragraph, contentWidth));

  const headerHeight = 96 + titleLines.length * TITLE_LINE_HEIGHT + 44;
  const bodyHeight =
    paragraphs.reduce((sum, lines) => sum + lines.length * BODY_LINE_HEIGHT, 0) +
    Math.max(0, paragraphs.length - 1) * 26;
  const footerHeight = 168;
  const height = Math.max(960, headerHeight + bodyHeight + footerHeight + PAD);

  canvas.width = WIDTH;
  canvas.height = height;

  // 纸面底色与横向格线
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, palette.paperTop);
  background.addColorStop(1, palette.paperBottom);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, height);

  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  for (let y = 120; y < height - 40; y += 48) {
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(WIDTH - PAD, y);
    ctx.stroke();
  }

  // 顶部标识
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.eyebrow;
  ctx.font = monoFont;
  ctx.fillText("SMARTISAN NOTES · CLASSIC NOTE SYSTEM", PAD, 74);

  ctx.fillStyle = palette.hairline;
  ctx.fillRect(PAD, 92, WIDTH - PAD * 2, 1);

  // 标题
  ctx.font = titleFont;
  ctx.fillStyle = palette.title;
  let cursor = 146;
  for (const line of titleLines) {
    ctx.fillText(line, PAD, cursor);
    cursor += TITLE_LINE_HEIGHT;
  }

  // 日期与署名
  ctx.font = monoFont;
  ctx.fillStyle = palette.meta;
  ctx.fillText(
    `${note.date.replaceAll("-", ".")} · ${site.handle}`,
    PAD,
    cursor + 6
  );

  cursor += 34;

  // 细红线
  const lineGradient = ctx.createLinearGradient(PAD, 0, WIDTH - PAD, 0);
  lineGradient.addColorStop(0, "rgba(212,35,42,0)");
  lineGradient.addColorStop(0.2, "rgba(212,35,42,0.9)");
  lineGradient.addColorStop(0.8, "rgba(212,35,42,0.9)");
  lineGradient.addColorStop(1, "rgba(212,35,42,0)");
  ctx.fillStyle = lineGradient;
  ctx.fillRect(PAD, cursor, WIDTH - PAD * 2, 1.5);

  cursor += 52;

  // 正文
  ctx.font = bodyFont;
  ctx.fillStyle = palette.body;
  paragraphs.forEach((lines, index) => {
    for (const line of lines) {
      ctx.fillText(line, PAD, cursor);
      cursor += BODY_LINE_HEIGHT;
    }
    if (index !== paragraphs.length - 1) cursor += 26;
  });

  // 页脚
  const footerY = height - footerHeight;
  ctx.strokeStyle = palette.footerLine;
  ctx.beginPath();
  ctx.moveTo(PAD, footerY);
  ctx.lineTo(WIDTH - PAD, footerY);
  ctx.stroke();

  ctx.fillStyle = palette.footerText;
  ctx.font = monoFont;
  ctx.fillText(`${site.name} · ${site.footerQuote}`, PAD, footerY + 46);

  // 火漆正印：与首页便签落款是同一枚印章，形状与字号必须与页面一致
  drawWaxSeal(ctx, {
    cx: WIDTH - PAD - 58,
    cy: footerY + 46,
    radius: 48,
    rotation: -5,
    lines: ["工匠出品", "骄傲制造"],
  });
  ctx.textAlign = "left";

  // 圆形邮戳：双环 + 日期 + 站点文字，低透明度叠印在页脚
  ctx.save();
  ctx.translate(WIDTH - PAD - 180, footerY + 46);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = "#ea353c";
  ctx.fillStyle = "#ea353c";

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.font = '700 8px "Roboto Mono", Consolas, monospace';
  ctx.fillText("SMARTISAN", 0, -18);
  ctx.font = '700 11px "Roboto Mono", Consolas, monospace';
  ctx.fillText(note.date.replaceAll("-", "."), 0, 4);
  ctx.font = '700 8px "Roboto Mono", Consolas, monospace';
  ctx.fillText("PROUD NOTE", 0, 20);

  // 邮戳左侧的注销波纹
  ctx.lineWidth = 1.5;
  for (let line = 0; line < 3; line += 1) {
    ctx.beginPath();
    ctx.moveTo(-96, -12 + line * 12);
    ctx.quadraticCurveTo(-84, -17 + line * 12, -70, -12 + line * 12);
    ctx.stroke();
  }
  ctx.restore();
  ctx.textAlign = "left";

  ctx.fillStyle = palette.footnote;
  ctx.font = '500 12px "Roboto Mono", Consolas, monospace';
  ctx.fillText("THE CRAFTSMAN BLOG · SMARTISAN CRAFTSMANSHIP", PAD, height - 28);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("长图生成失败");

  const filename = `smartisan-note-${note.date || "today"}.png`;
  const file = new File([blob], filename, { type: "image/png" });

  /**
   * canvas.toBlob 是异步的，await 之后 iOS 已经把这次点击判定为非用户手势，
   * a[download] 会被忽略或直接开新标签。优先走 Web Share Level 2，
   * 让系统分享面板里的「存储图像」接管保存。
   */
  if (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: note.title });
      return { mode: "share" };
    } catch (error) {
      // 用户主动取消分享时不再回退下载，避免「取消后又偷偷存一份」
      if (error instanceof DOMException && error.name === "AbortError") {
        return { mode: "share" };
      }
    }
  }

  const url = URL.createObjectURL(blob);

  // 触屏设备展示可长按保存的图片层，由 NoteModal 渲染并负责回收 objectURL
  if (isTouchDevice()) {
    return { mode: "preview", url, filename };
  }

  // 桌面保留 a[download] 兜底
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { mode: "download" };
}
