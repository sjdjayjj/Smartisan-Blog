/**
 * 文章分享图字体：从 Noto Serif SC 源字体裁出「ASCII + GB2312 一级汉字 + GB2312 符号」，
 * 输出 WOFF（next/og 底层的 fontkit 不支持 woff2，所以正文分片不能直接复用到 Png 渲染）。
 *
 * 用法：npm run fonts:og
 *
 * 产物：
 * - public/fonts/noto-serif-sc-og/noto-serif-sc-og.woff（单字重 700，供 ImageResponse 使用）
 * - src/lib/og-font-coverage.json（覆盖码点区间，OG 路由据此判断标题是否需要回退根图）
 *
 * 覆盖范围刻意只到 GB2312 一级：她覆盖绝大多数标题用字，又不会让单个资源膨胀到数 MB；
 * 区间外的标题由 /post/[slug]/opengraph-image 回退到站点根分享图，不会出现缺字方块。
 *
 * 这是一次性生成，字体文件与覆盖表随仓库提交，日常构建不重跑。
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import subsetFont from "subset-font";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public/fonts/noto-serif-sc-og");
const COVERAGE_PATH = path.join(ROOT, "src/lib/og-font-coverage.json");
const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf";
// 与正文分片保持同一字重档位，OG 卡片统一用 700
const WEIGHT = 700;

/** 从 GB2312 码位解出汉字与符号。 */
function buildCharset() {
  const decoder = new TextDecoder("gb18030");
  const chars = new Set();
  for (let code = 0x20; code < 0x7f; code += 1) chars.add(String.fromCodePoint(code));

  for (let high = 0xa1; high <= 0xf7; high += 1) {
    for (let low = 0xa1; low <= 0xfe; low += 1) {
      const char = decoder.decode(new Uint8Array([high, low]));
      const code = char.codePointAt(0);
      if (char.length !== 1 || !code) continue;
      // 过滤控制字符与私用区（GB2312 未定义码位会解出 PUA）
      if (code < 0x20 || (code >= 0xe000 && code <= 0xf8ff)) continue;
      // 二级汉字（0xD8–0xF7 区）不进分享图字体，避免资源过大
      if (code >= 0x4e00 && code <= 0x9fff && high >= 0xd8) continue;
      chars.add(char);
    }
  }
  return chars;
}

/** 码点集合压缩成 [start, end] 区间数组。 */
function toRanges(chars) {
  const codes = [...new Set([...chars].map((char) => char.codePointAt(0)))].sort(
    (a, b) => a - b
  );
  const ranges = [];
  let start = codes[0];
  let prev = codes[0];
  for (let index = 1; index <= codes.length; index += 1) {
    const code = codes[index];
    if (code === prev + 1) {
      prev = code;
      continue;
    }
    ranges.push([start, prev]);
    start = code;
    prev = code;
  }
  return ranges.filter((range) => range.every((value) => value !== undefined));
}

async function downloadFont() {
  const cache = path.join(os.tmpdir(), "noto-serif-sc-wght.ttf");
  try {
    const stat = await fs.stat(cache);
    if (stat.size > 1_000_000) return fs.readFile(cache);
  } catch {
    // 未缓存，走下载
  }
  const response = await fetch(FONT_URL, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`字体下载失败：HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(cache, buffer);
  return buffer;
}

async function main() {
  const chars = buildCharset();
  console.log(`字符集：${chars.size} 个（ASCII + GB2312 一级汉字与符号）`);

  const source = await downloadFont();
  const output = await subsetFont(source, [...chars].join(""), {
    targetFormat: "woff",
    variationAxes: { wght: WEIGHT },
  });

  await fs.mkdir(OUT_DIR, { recursive: true });
  const fontPath = path.join(OUT_DIR, "noto-serif-sc-og.woff");
  await fs.writeFile(fontPath, output);
  console.log(
    `${path.relative(ROOT, fontPath)}: ${(output.length / 1024).toFixed(1)} KB（${output.length} B）`
  );

  await fs.writeFile(
    COVERAGE_PATH,
    `${JSON.stringify({ weight: WEIGHT, ranges: toRanges(chars) })}\n`
  );
  console.log(`已写入 ${path.relative(ROOT, COVERAGE_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
