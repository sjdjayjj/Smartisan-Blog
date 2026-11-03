import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 逐篇分享图在运行时读取自托管 OG 字体（assets/，不在 public/），必须纳入文件追踪，
  // 否则 Vercel 的 serverless 函数里没有该文件，会静默回退到根分享图。
  //
  // 键用 glob 而非字面量 /post/[slug]/opengraph-image：Next 用 picomatch(contains:true)
  // 匹配路由，字面量里的 [slug] 会被当成「字符类」，永远匹配不到含方括号的真实路由。
  outputFileTracingIncludes: {
    "/post/**/opengraph-image": ["./assets/fonts/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
