/**
 * 中文字体裁剪：站点实际用字 + GB2312 常用汉字表，生成 Noto Serif SC 子集。
 *
 * 用法：npm run fonts:subset
 *
 * 为什么需要这个脚本：
 * - 线上原方案是 Google Fonts 的 101 个全量 CJK 分片（约 6.6MB），
 *   首屏按 unicode-range 命中 26 片、约 1.82MB，远超正文实际用字。
 * - 这里抓取线上已渲染页面 + 本地源码字符串，统计真实用字，
 *   再叠加一份固定的常用汉字表（GB2312 全部 6763 个汉字，见下），
 *   保证新增文章出现生僻字时也能命中自托管字体，不回退系统 serif。
 *
 * 分片策略（每片独立 unicode-range，浏览器只拉命中的文件）：
 * - core：首页 + 本地源码 + ASCII，首屏只命中这一片，体积必须保持稳定；
 * - mid：站点其余用字（含全部已发布文章），现有文章最多命中 core + mid；
 * - tail-l1 / tail-l2：GB2312 一级（3755 字）/ 二级（3008 字）中尚未覆盖的字，
 *   拆成两片是为了避免单片达到 2MB（一级约 1MB、二级约 1.1MB）。
 *
 * 常用字表来源：GB 2312-1980（通过 Node 内置 TextDecoder('gb18030') 解码码位
 * 0xB0A1–0xD7F9 / 0xD8A1–0xF7FE 得到，只保留 U+4E00–U+9FFF 的汉字）。
 * 完全可复现，无需额外数据文件或第三方依赖。
 *
 * 注意：GB2312 之外的生僻字（如「龘」）仍会回退系统字体；如需扩到
 * 《通用规范汉字表》三级字表，请新增一个独立分片，不要塞进 tail-l2。
 *
 * 依赖 subset-font（harfbuzz wasm），仅作为 devDependency 使用，不进入运行时。
 * 这是一次性生成：字体文件随仓库提交，日常构建不重跑；只有想追最新站点用字时才重跑。
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
// 单分片上限：任何页面命中一片都不该拖走数 MB
const MAX_SHARD_BYTES = 1_500_000;

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
  for (const [char] of await collectLocalOnly()) counts.set(char, counts.get(char) ?? 0);

  return { counts, postCount: postUrls.length, home };
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

/**
 * 从 GB2312 码位解出全部 6763 个汉字，按一级 / 二级分开。
 * 一级：0xB0A1–0xD7F9（3755 字，常用）；二级：0xD8A1–0xF7FE（3008 字，次常用）。
 * 0xD7FA–0xD7FE 在 GB18030 中映射到 PUA，用 U+4E00–U+9FFF 过滤掉。
 */
function buildGb2312Hanzi() {
  const decoder = new TextDecoder("gb18030");
  const level1 = new Set();
  const level2 = new Set();
  const tables = [
    { start: 0xb0, end: 0xd7, bucket: level1 },
    { start: 0xd8, end: 0xf7, bucket: level2 },
  ];
  for (const { start, end, bucket } of tables) {
    for (let high = start; high <= end; high += 1) {
      for (let low = 0xa1; low <= 0xfe; low += 1) {
        const char = decoder.decode(new Uint8Array([high, low]));
        const code = char.codePointAt(0);
        if (char.length === 1 && code >= 0x4e00 && code <= 0x9fff) bucket.add(char);
      }
    }
  }
  return { level1, level2 };
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
  const { counts, postCount, home } = await collectCorpus();
  console.log(`共 ${counts.size} 个字符，覆盖 ${postCount} 篇文章`);

  // core：首页 + 本地源码里出现的字，保证首屏只下载最小的一个文件
  const coreSet = new Set();
  for (const char of textOfHtml(home)) coreSet.add(char);
  for (const char of (await collectLocalOnly()).keys()) coreSet.add(char);
  // ASCII 可见字符一并保留，避免拉丁标点回退
  for (let code = 0x20; code < 0x7f; code += 1) coreSet.add(String.fromCodePoint(code));

  // mid：站点其余用字（全部已发布文章都在这里，现有文章不会碰 tail）
  const midSet = new Set(
    [...counts.keys()].filter((char) => !coreSet.has(char))
  );

  // tail：GB2312 常用汉字表中尚未被 core/mid 覆盖的字
  const gb = buildGb2312Hanzi();
  console.log(`GB2312 一级 ${gb.level1.size} 字 / 二级 ${gb.level2.size} 字`);
  const used = new Set([...coreSet, ...midSet]);
  const tailL1 = new Set([...gb.level1].filter((char) => !used.has(char)));
  const tailL2 = new Set([...gb.level2].filter((char) => !used.has(char)));

  // 断言：站点用字（含现有全部文章）必须 100% 被某个分片覆盖
  const covered = new Set([...used, ...tailL1, ...tailL2]);
  const missing = [...counts.keys()].filter((char) => !covered.has(char));
  if (missing.length > 0) {
    throw new Error(`站点用字未被分片覆盖：${missing.slice(0, 20).join("")}`);
  }

  const buckets = [
    { name: "core", chars: coreSet },
    { name: "mid", chars: midSet },
    { name: "tail-l1", chars: tailL1 },
    { name: "tail-l2", chars: tailL2 },
  ].filter((bucket) => bucket.chars.size > 0);

  console.log(
    `分桶：${buckets.map((bucket) => `${bucket.name}=${bucket.chars.size}`).join(" / ")}`
  );

  console.log("下载源字体…");
  const source = await downloadFont();

  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const rules = [];
  let totalBytes = 0;
  for (const bucket of buckets) {
    const text = [...bucket.chars].join("");
    const output = await subsetFont(source, text, { targetFormat: "woff2" });
    if (output.length > MAX_SHARD_BYTES) {
      throw new Error(
        `${bucket.name} 分片 ${output.length} B 超过上限 ${MAX_SHARD_BYTES} B，请拆分后再生成`
      );
    }
    totalBytes += output.length;
    const fileName = `noto-serif-sc-${bucket.name}.woff2`;
    await fs.writeFile(path.join(OUT_DIR, fileName), output);
    console.log(
      `${fileName}: ${output.length} B（${(output.length / 1024).toFixed(1)} KB），覆盖 ${bucket.chars.size} 字`
    );
    rules.push(
      `@font-face{font-family:"Noto Serif SC";font-style:normal;font-weight:400 700;font-display:swap;src:url("/fonts/noto-serif-sc-subset/${fileName}") format("woff2");unicode-range:${toUnicodeRange(
        bucket.chars
      )};}`
    );
  }
  console.log(`分片合计 ${totalBytes} B（${(totalBytes / 1024).toFixed(1)} KB）`);

  const css = await fs.readFile(CSS_PATH, "utf8");
  const kept = css
    // 先整体删掉本脚本生成过的头部注释（含旧版），避免重复堆积
    .replace(/\/\* 自动生成：Noto Serif SC[\s\S]*?\*\/\n?/g, "")
    .split("\n")
    .filter((line) => !line.includes('font-family:"Noto Serif SC"'))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  const header = `/* 自动生成：Noto Serif SC 子集 = 站点用字 + GB2312 常用汉字表（见 scripts/subset-cjk-font.mjs）。
   四片各自独立 unicode-range：core 覆盖首屏，mid 覆盖站点其余用字（现有文章），
   tail-l1/tail-l2 覆盖 GB2312 一级/二级生僻字；表外字符仍回退系统 serif。 */`;
  await fs.writeFile(CSS_PATH, `${header}\n${kept}\n${rules.join("\n")}\n`);
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
