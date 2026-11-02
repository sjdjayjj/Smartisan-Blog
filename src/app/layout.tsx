import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/seo";
import "./globals.css";
import "./fonts.css";

const title = "理想主义者的自留地 · @smartisandesign";
const description =
  "一个向 Smartisan OS 与工业设计黄金时代致敬的独立数字空间 — 严格对称 · 拟物质感 · 细红线。";

/**
 * viewportFit: "cover" 是 env(safe-area-inset-*) 生效的前提；
 * themeColor 与内联主题脚本共用同一个 meta，脚本会按主题覆写颜色。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141416",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  keywords: ["Smartisan", "锤子科技", "拟物化", "独立博客", "工匠精神"],
  authors: [{ name: "工匠精神" }],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "理想主义者的自留地",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

/**
 * 首屏阻塞脚本：在样式表生效前把主题写到 <html>，避免先渲染深色再跳浅色的闪白。
 * 必须内联且同步执行，不能改成 useEffect / next/script 的异步策略。
 */
const themeInitScript = `(function(){try{
var k="smartisan:theme";
var saved=window.localStorage.getItem(k);
var theme=(saved==="light"||saved==="dark")?saved:((window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches)?"light":"dark");
var root=document.documentElement;
root.dataset.theme=theme;
root.style.colorScheme=theme;
var meta=document.querySelector('meta[name="theme-color"]');
if(!meta){meta=document.createElement("meta");meta.name="theme-color";document.head.appendChild(meta);}
meta.content=theme==="light"?"#eae6dd":"#141416";
}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" data-theme="dark" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* RSS 自动发现：直接写死静态 link，避免 metadata.alternates 在 cacheComponents 下触发动态预渲染阻塞 */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="理想主义者的自留地 · RSS"
          href="/feed.xml"
        />
        {/* 字体同源自托管（见 fonts.css）：只预载首屏必然用到的 latin 子集，
            CJK 分片按 unicode-range 由浏览器按需拉取，不预载以免抢首屏带宽。 */}
        <link
          rel="preload"
          href="/fonts/roboto/400-normal-008.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/playfair-display/700-normal-011.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/roboto-mono/400-normal-005.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <a href="#main-content" className="skip-link">
          跳至正文内容
        </a>
        {children}
      </body>
    </html>
  );
}
