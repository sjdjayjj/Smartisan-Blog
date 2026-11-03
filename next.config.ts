import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 逐篇分享图在运行时读取自托管 OG 字体，显式纳入文件追踪，避免部署后缺文件
  outputFileTracingIncludes: {
    "/post/[slug]/opengraph-image": ["./public/fonts/noto-serif-sc-og/**"],
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
