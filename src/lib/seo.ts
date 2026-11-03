/**
 * 站点绝对地址与结构化数据：线上读取 SITE_URL，未配置时回退到示例域名。
 * 仅服务端使用（sitemap / robots / RSS / metadataBase / JSON-LD），不要引入到客户端组件。
 */
import { site } from "@/lib/site";

export const siteUrl = (
  process.env.SITE_URL?.trim() || "https://blog.sjdjayjj.eu.org"
).replace(/\/$/, "");

export function absoluteUrl(pathname = "/"): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${siteUrl}${path}`;
}

/** 只保留日期部分并转 ISO；无法解析时返回 null。 */
export function isoDate(value: string): string | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export interface PostSeoInput {
  slug: string;
  title: string;
  summary: string;
  date: string;
}

/** 文章页结构化数据：BlogPosting + BreadcrumbList（首页 → 文章）。 */
export function postJsonLd(post: PostSeoInput): Record<string, unknown>[] {
  const url = absoluteUrl(`/post/${post.slug}`);
  const image = absoluteUrl(`/post/${post.slug}/opengraph-image`);
  const published = isoDate(post.date);

  return [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      headline: post.title,
      description: post.summary || site.bio,
      ...(published ? { datePublished: published, dateModified: published } : {}),
      author: { "@type": "Person", name: site.author },
      publisher: { "@type": "Organization", name: site.name, url: siteUrl },
      image: [image],
      url,
      inLanguage: "zh-CN",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: siteUrl },
        { "@type": "ListItem", position: 2, name: post.title, item: url },
      ],
    },
  ];
}

/** 首页 WebSite 结构化数据。 */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: siteUrl,
  };
}

/** 序列化为可安全注入 <script> 的 JSON（转义 `<` 防止提前闭合）。 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
