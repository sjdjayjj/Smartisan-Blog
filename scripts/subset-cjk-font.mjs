/**
 * 中文字体裁剪：按站点实际用字生成 Noto Serif SC 子集。
 *
 * 用法：npm run fonts:subset
 *
 * 为什么需要这个脚本：
 * - 线上原方案是 Google Fonts 的 101 个全量 CJK 分片（约 6.6MB），
 *   首屏按 unicode-range 命中 26 片、约 1.82MB，远超正文实际用字。
 * - 这里抓取线上已渲染页面 + 本地源码字符串，统计真实用字，
 *   生成 3 个字重 400-700 的可变字体子集（core / mid / tail），
 *   浏览器只会下载 unicode-range 命中的文件。
 *
 * 依赖 subset-font（harfbuzz wasm），仅作为 devDependency 使用，不进入运行时。
 * 新增文章后如需覆盖新字，重跑一次即可；未覆盖的字会回退系统 serif。
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import subsetFont from "subset-font";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public/fonts/noto-serif-sc-subset");
const CSS_PATH = path.join(ROOT, "src/app/fonts.css");
const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf";
const SITE = "https://blog.sjdjayjj.eu.org";

const HTML_TAG = /<[^>]*>/g;

function decodeEntities(text) {
  return text
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function textOfHtml(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(HTML_TAG, " ")
  );
}

function countChars(text, map) {
  for (const char of text) {
    const code = char.codePointAt(0);
    // 只保留可打印字符，控制字符与空白单独处理
    if (code < 0x20 || code === 0x7f) continue;
    map.set(char, (map.get(char) ?? 0) + 1);
  }
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.text();
}

async function collectCorpus() {
  const counts = new Map();
  const home = await fetchText(`${SITE}/`);
  countChars(textOfHtml(home), counts);

  const sitemap = await fetchText(`${SITE}/sitemap.xml`);
  const postUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1])
    .filter((url) => url.includes("/post/"));
  for (const url of postUrls) {
    countChars(textOfHtml(await fetchText(url)), counts);
  }

  // 客户端交互文案不出现在首屏 HTML，补扫本地源码（先粗略去掉注释）
  const sources = await listFiles(path.join(ROOT, "src"));
  for (const file of sources) {
    if (!/\.(ts|tsx|css|mdoc|md)$/.test(file)) continue;
    const raw = await fs.readFile(file, "utf8");
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    countChars(stripped, counts);
  }

  return { counts, postCount: postUrls.length };
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else files.push(full);
  }
  return files;
}

async function downloadFont() {
  const cache = path.join(os.tmpdir(), "noto-serif-sc-wght.ttf");
  try {
    const stat = await fs.stat(cache);
    if (stat.size > 1_000_000) return fs.readFile(cache);
  } catch {
    // 未缓存
  }
  const response = await fetch(FONT_URL, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`字体下载失败：HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(cache, buffer);
  return buffer;
}

/** 把码点集合压缩成 unicode-range 文本。 */
function toUnicodeRange(chars) {
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
    ranges.push(start === prev ? `U+${start.toString(16)}` : `U+${start.toString(16)}-${prev.toString(16)}`);
    start = code;
    prev = code;
  }
  return ranges.filter(Boolean).join(", ");
}

async function main() {
  console.log("抓取线上页面统计用字…");
  const { counts, postCount } = await collectCorpus();
  console.log(`共 ${counts.size} 个字符，覆盖 ${postCount} 篇文章`);

  // core：首页 + 本地源码里出现的字，保证首屏只下载最小的一个文件
  const home = await fetchText(`${SITE}/`);
  const coreSet = new Set();
  for (const char of textOfHtml(home)) coreSet.add(char);
  const sourceCounts = await collectLocalOnly();
  for (const char of sourceCounts.keys()) coreSet.add(char);
  // ASCII 可见字符一并保留，避免拉丁标点回退
  for (let code = 0x20; code < 0x7f; code += 1) coreSet.add(String.fromCodePoint(code));

  const rest = [...counts.entries()]
    .filter(([char]) => !coreSet.has(char))
    .sort((a, b) => b[1] - a[1])
    .map(([char]) => char);
  const midCount = Math.ceil(rest.length / 2);

  const buckets = [
    { name: "core", chars: coreSet },
    { name: "mid", chars: new Set(rest.slice(0, midCount)) },
    { name: "tail", chars: new Set(rest.slice(midCount)) },
  ].filter((bucket) => bucket.chars.size > 0);

  console.log(
    `分桶：${buckets.map((bucket) => `${bucket.name}=${bucket.chars.size}`).join(" / ")}`
  );

  console.log("下载源字体…");
  const source = await downloadFont();

  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const rules = [];
  for (const bucket of buckets) {
    const text = [...bucket.chars].join("");
    const output = await subsetFont(source, text, { targetFormat: "woff2" });
    const fileName = `noto-serif-sc-${bucket.name}.woff2`;
    await fs.writeFile(path.join(OUT_DIR, fileName), output);
    const kb = (output.length / 1024).toFixed(1);
    console.log(`${fileName}: ${kb} KB`);
    rules.push(
      `@font-face{font-family:"Noto Serif SC";font-style:normal;font-weight:400 700;font-display:swap;src:url("/fonts/noto-serif-sc-subset/${fileName}") format("woff2");unicode-range:${toUnicodeRange(
        bucket.chars
      )};}`
    );
  }

  const css = await fs.readFile(CSS_PATH, "utf8");
  const kept = css
    .split("\n")
    .filter((line) => !line.includes('font-family:"Noto Serif SC"'))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  const header = `/* 自动生成：Noto Serif SC 站内用字子集（见 scripts/subset-cjk-font.mjs）。
   中文按 unicode-range 分片：core 覆盖首屏，mid/tail 覆盖长文；未覆盖的字回退系统 serif。 */
`;
  await fs.writeFile(CSS_PATH, `${header}${kept}\n${rules.join("\n")}\n`);
  console.log(`已重写 ${path.relative(ROOT, CSS_PATH)}`);
}

async function collectLocalOnly() {
  const map = new Map();
  const sources = await listFiles(path.join(ROOT, "src"));
  for (const file of sources) {
    if (!/\.(ts|tsx|css|mdoc|md)$/.test(file)) continue;
    const raw = await fs.readFile(file, "utf8");
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    countChars(stripped, map);
  }
  return map;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
