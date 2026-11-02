import { WAX_SEAL_RADIUS, sealDrip, sealLayout, sealOutline } from "@/lib/waxSeal";

/**
 * 长图导出用的火漆正印。
 *
 * 与 DOM 版共用 lib/waxSeal 的轮廓点集和文字排版，
 * 把蜡体受光、蜡沿厚度、蜡泪与凹刻文字用 Canvas 指令重画一遍，
 * 保证导出的 PNG 与页面上是同一枚印章。
 */
export function drawWaxSeal(
  ctx: CanvasRenderingContext2D,
  options: {
    cx: number;
    cy: number;
    radius: number;
    lines: string[];
    rotation?: number;
  }
) {
  const { cx, cy, radius, lines, rotation = -5 } = options;
  const base = WAX_SEAL_RADIUS;
  const scale = radius / base;

  const body = new Path2D(sealOutline(0, 0, base));
  const solid = new Path2D(`${sealOutline(0, 0, base)} ${sealDrip(0, 0, base)}`);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);

  // 蜡渗晕
  ctx.save();
  ctx.filter = "blur(1.5px)";
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#d4232a";
  ctx.scale(1.05, 1.05);
  ctx.fill(solid);
  ctx.restore();

  // 纸面投影
  ctx.save();
  ctx.filter = "blur(2.2px)";
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#000000";
  ctx.translate(0.8, 2.6);
  ctx.fill(solid);
  ctx.restore();

  // 蜡体底色 + 中心压实形成的暗哑面
  ctx.fillStyle = "#d4232a";
  ctx.fill(body);

  const core = ctx.createRadialGradient(0, base * 0.06, base * 0.1, 0, base * 0.06, base * 0.66);
  core.addColorStop(0, "rgba(0, 0, 0, 0.34)");
  core.addColorStop(0.68, "rgba(0, 0, 0, 0.08)");
  core.addColorStop(1, "rgba(0, 0, 0, 0.24)");
  ctx.fillStyle = core;
  ctx.fill(body);

  // 整体受光：左上提亮、右下压暗
  const light = ctx.createLinearGradient(-base * 0.7, -base * 0.8, base * 0.7, base * 0.8);
  light.addColorStop(0, "rgba(255, 255, 255, 0.1)");
  light.addColorStop(0.4, "rgba(255, 255, 255, 0)");
  light.addColorStop(1, "rgba(0, 0, 0, 0.46)");
  ctx.fillStyle = light;
  ctx.fill(body);
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  ctx.fill(body);

  // 蜡沿厚度
  ctx.strokeStyle = "rgba(0, 0, 0, 0.32)";
  ctx.lineWidth = 0.8;
  ctx.stroke(body);

  const rim = ctx.createLinearGradient(-base * 0.8, -base * 0.9, base * 0.8, base * 0.9);
  rim.addColorStop(0, "rgba(255, 255, 255, 0.34)");
  rim.addColorStop(0.4, "rgba(255, 255, 255, 0.03)");
  rim.addColorStop(1, "rgba(0, 0, 0, 0.6)");
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.6;
  ctx.stroke(new Path2D(sealOutline(0, 0, base, 0.94)));

  // 中心碟形凹陷
  ctx.strokeStyle = "rgba(0, 0, 0, 0.24)";
  ctx.lineWidth = 1.2;
  ctx.stroke(new Path2D(sealOutline(0, 0, base, 0.86)));

  ctx.save();
  ctx.translate(0, 0.9);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 0.7;
  ctx.stroke(new Path2D(sealOutline(0, 0, base, 0.84)));
  ctx.restore();

  // 蜡泪：最后画，盖住蜡体下缘，像一小截溢出的熔蜡
  const drip = new Path2D(sealDrip(0, 0, base));
  const dripFill = ctx.createLinearGradient(-base * 0.2, 0, base * 0.3, base * 0.6);
  dripFill.addColorStop(0, "#d4232a");
  dripFill.addColorStop(1, "#7f1d1d");
  ctx.fillStyle = dripFill;
  ctx.fill(drip);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
  ctx.lineWidth = 0.55;
  ctx.stroke(drip);
  ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
  ctx.fill(drip);

  // 凹刻文字
  const layout = sealLayout(lines);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${layout.fontSize}px "Noto Serif SC", "Songti SC", serif`;
  ctx.letterSpacing = `${layout.letterSpacing}px`;

  for (const row of layout.rows) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fillText(row.text, 0, row.y + 0.6);
    ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
    ctx.fillText(row.text, 0, row.y);
  }

  ctx.letterSpacing = "0px";
  ctx.restore();
}
