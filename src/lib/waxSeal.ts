/**
 * 火漆正印的固定几何与版式。
 *
 * 印章是「同一件实物」：轮廓、蜡泪位置、文案字号都不随渲染变化。
 * DOM（SVG）与长图导出（Canvas）共用这里的点集和排版规则，
 * 保证页面与导出图上的印章形态完全一致。
 */

/** 基准半径：所有点集以此为 1 倍，绘制时按目标半径等比缩放。 */
export const WAX_SEAL_RADIUS = 38;

/** 外轮廓：极坐标点（角度° / 半径系数），固定形态，不做随机扰动。 */
const OUTLINE: Array<{ angle: number; radius: number }> = [
  { angle: 0, radius: 1 },
  { angle: 15, radius: 0.988 },
  { angle: 30, radius: 1.012 },
  { angle: 45, radius: 0.978 },
  { angle: 60, radius: 1.02 },
  { angle: 75, radius: 0.98 },
  { angle: 90, radius: 0.972 },
  { angle: 105, radius: 1.014 },
  { angle: 120, radius: 0.984 },
  { angle: 135, radius: 1.018 },
  { angle: 150, radius: 0.976 },
  { angle: 165, radius: 1.01 },
  { angle: 180, radius: 0.986 },
  { angle: 195, radius: 1.016 },
  { angle: 210, radius: 0.98 },
  { angle: 225, radius: 1.022 },
  { angle: 240, radius: 0.982 },
  { angle: 255, radius: 1.012 },
  { angle: 270, radius: 0.978 },
  { angle: 285, radius: 1.02 },
  { angle: 300, radius: 0.984 },
  { angle: 315, radius: 1.014 },
  { angle: 330, radius: 0.98 },
  { angle: 345, radius: 1.008 },
];

const round = (value: number) => Math.round(value * 100) / 100;

function polar(
  cx: number,
  cy: number,
  radius: number,
  point: { angle: number; radius: number }
): [number, number] {
  const rad = (point.angle * Math.PI) / 180;
  return [cx + Math.cos(rad) * radius * point.radius, cy + Math.sin(rad) * radius * point.radius];
}

/**
 * 闭合的平滑不规则轮廓：用二次贝塞尔穿过相邻点中点，
 * 得到「熔蜡自然摊开」的毛边，而不是规则圆。
 */
export function sealOutline(cx: number, cy: number, radius: number, scale = 1): string {
  const points = OUTLINE.map((point) => polar(cx, cy, radius * scale, point));
  const total = points.length;
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];

  const start = mid(points[total - 1], points[0]);
  let path = `M ${round(start[0])} ${round(start[1])}`;

  for (let index = 0; index < total; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % total];
    const control = mid(current, next);
    path += ` Q ${round(current[0])} ${round(current[1])} ${round(control[0])} ${round(control[1])}`;
  }

  return `${path} Z`;
}

/**
 * 底部蜡泪：从蜡体下缘溢出的一小截熔蜡。
 * 根部埋在蜡体内部、末端收细，避免出现一根钉在底部的细刺。
 */
export function sealDrip(cx: number, cy: number, radius: number): string {
  const x = (k: number) => round(cx + k * radius);
  const y = (k: number) => round(cy + k * radius);

  return [
    `M ${x(0.05)} ${y(0.88)}`,
    `C ${x(0.02)} ${y(0.99)} ${x(0.05)} ${y(1.09)} ${x(0.14)} ${y(1.12)}`,
    `C ${x(0.23)} ${y(1.15)} ${x(0.3)} ${y(1.09)} ${x(0.31)} ${y(1.01)}`,
    `C ${x(0.32)} ${y(0.95)} ${x(0.31)} ${y(0.91)} ${x(0.31)} ${y(0.88)}`,
    "Z",
  ].join(" ");
}

export type SealRow = { text: string; y: number };

/**
 * 压印文字排版：4 字及以上压小字号保两行可读，2 字以内放大做主体。
 * 返回的 y 以印章圆心为原点，SVG 与 Canvas 都能直接使用。
 */
export function sealLayout(lines: string[], centerY = 0) {
  const maxLength = Math.max(...lines.map((line) => Array.from(line).length));
  const tight = maxLength >= 4;
  const fontSize = tight ? 12.5 : 20;
  const lineHeight = tight ? 15 : 23;
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.34;

  const rows: SealRow[] = lines.map((text, index) => ({
    text,
    y: startY + index * lineHeight,
  }));

  return {
    fontSize,
    letterSpacing: tight ? 0.5 : 1.8,
    rows,
  };
}
