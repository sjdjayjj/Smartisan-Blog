import { loadPosts } from "@/lib/github";
import { categoryMeta, site } from "@/lib/site";
import { absoluteUrl, siteUrl } from "@/lib/seo";

/**
 * RSS 2.0 订阅源：link 指向 /post/[slug] 独立路由，便于聚合器直接抓取正文；
 * guid 仍用 slug 且 isPermaLink=false，URL 调整不会让旧条目被判定为重复。
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

export async function GET() {
  const posts = await loadPosts();
  const items = posts
    .map((post) => {
      const meta = categoryMeta[post.category] ?? categoryMeta.thinking;
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${absoluteUrl(`/post/${encodeURIComponent(post.slug)}`)}</link>`,
        `      <guid isPermaLink="false">smartisan-blog:${escapeXml(post.slug)}</guid>`,
        `      <pubDate>${toRfc822(post.date)}</pubDate>`,
        `      <category>${escapeXml(meta.label)}</category>`,
        `      <description>${escapeXml(post.summary)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(site.name)}</title>`,
    `    <link>${siteUrl}</link>`,
    `    <description>${escapeXml(site.bio)}</description>`,
    "    <language>zh-CN</language>",
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${absoluteUrl("/feed.xml")}" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
