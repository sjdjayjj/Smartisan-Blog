import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import RootImage from "@/app/opengraph-image";
import coverage from "@/lib/og-font-coverage.json";
import { isValidSlug, loadPostWithStatus } from "@/lib/github";
import { categoryMeta, site } from "@/lib/site";

/**
 * 逐篇文章分享图：按标题生成 1200×630 卡片。
 *
 * 字体来自自托管的 OG 子集（scripts/build-og-font.mjs 生成，GB2312 一级 + 符号），
 * 不依赖外部 CDN。标题含覆盖范围外的生僻字、内容源异常或渲染出错时，
 * 一律回退到站点根分享图，保证列表页与爬虫拿到的仍是合法图片而不是 500。
 */
export const alt = "文章分享图 · 理想主义者的自留地";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 字体放在 public/ 之外的 assets/：Vercel 只把 public/ 当静态资源分发，
// serverless 函数运行时读不到，必须靠 next.config.ts 的文件追踪纳入函数 bundle。
const FONT_PATH = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "assets/fonts/noto-serif-sc-og.woff"
);
const RANGES: number[][] = coverage.ranges;

let fontData: Promise<Buffer | null> | null = null;

/** 只读一次，失败后同样缓存 null，避免每个请求重复 IO。 */
function loadFont(): Promise<Buffer | null> {
  if (!fontData) {
    fontData = readFile(FONT_PATH).catch((error) => {
      console.error("[og] 读取分享图字体失败：", error);
      return null;
    });
  }
  return fontData;
}

/** 标题里每个字符都必须在字体覆盖区间内，否则会渲染成缺字。 */
function isCovered(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0);
    if (!code || code === 0x20 || code === 0x0a) continue;
    let covered = false;
    for (const [start, end] of RANGES) {
      if (start !== undefined && end !== undefined && code >= start && code <= end) {
        covered = true;
        break;
      }
    }
    if (!covered) return false;
  }
  return true;
}

function formatDate(date: string): string {
  return date.replaceAll("-", ".");
}

interface CardProps {
  title: string;
  badge: string;
  readTime: number;
  date: string;
}

/** 卡片 JSX 独立成函数：渲染异常由外层 try/catch 兜住并回退根图。 */
function renderCard({ title, badge, readTime, date }: CardProps) {
  const fontSize = title.length > 22 ? 54 : 66;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "linear-gradient(160deg, #24262b 0%, #141416 65%)",
        padding: "64px 72px",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background:
            "linear-gradient(90deg, transparent, #d4232a 25%, #ea353c 50%, #d4232a 75%, transparent)",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(180deg, #2e3138, #1c1d21)",
            border: "1px solid rgba(255,255,255,0.16)",
            color: "#d4232a",
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          S
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#f5f5f7", fontSize: 22, letterSpacing: 6, fontWeight: 700 }}>
            SMARTISAN CRAFTSMANSHIP
          </div>
          <div
            style={{
              display: "flex",
              color: "#8e8e93",
              fontSize: 16,
              letterSpacing: 3,
              marginTop: 6,
              fontWeight: 700,
            }}
          >
            {badge} · {readTime} MIN READ
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            color: "#ffffff",
            fontSize,
            fontWeight: 700,
            letterSpacing: 1,
            lineHeight: 1.25,
            lineClamp: 2,
            overflow: "hidden",
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 28 }}>
          <div style={{ width: 96, height: 2, background: "#d4232a" }} />
          <div
            style={{
              display: "flex",
              color: "#c5a059",
              fontSize: 24,
              letterSpacing: 2,
              fontWeight: 700,
            }}
          >
            {site.tagline} · {formatDate(date)}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          paddingTop: 26,
        }}
      >
        <div style={{ color: "#8e8e93", fontSize: 18, letterSpacing: 2, fontWeight: 700 }}>
          AN INDEPENDENT DIGITAL SPACE · 2026
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 84,
            height: 84,
            border: "2px solid #d4232a",
            color: "#ea353c",
            fontSize: 18,
            letterSpacing: 3,
            fontWeight: 700,
            transform: "rotate(-5deg)",
          }}
        >
          PROUD
        </div>
      </div>
    </div>
  );
}

export default async function PostOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  try {
    const { slug } = await params;
    if (!isValidSlug(slug)) return RootImage();

    const result = await loadPostWithStatus(slug);
    if (result.status !== "ok") return RootImage();

    const post = result.post;
    if (!isCovered(post.title)) {
      console.warn(`[og] 标题含未覆盖字符，回退根图：${slug}`);
      return RootImage();
    }

    const font = await loadFont();
    if (!font) return RootImage();

    const meta = categoryMeta[post.category] ?? categoryMeta.thinking;

    return new ImageResponse(
      renderCard({
        title: post.title,
        badge: meta.badge,
        readTime: post.readTime,
        date: post.date,
      }),
      {
        ...size,
        fonts: [{ name: "Noto Serif SC", data: font, weight: 700, style: "normal" }],
      }
    );
  } catch (error) {
    console.error("[og] 生成失败，回退根分享图：", error);
    return RootImage();
  }
}
