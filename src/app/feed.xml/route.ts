import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import MarkdocContent from "@/components/MarkdocContent";
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

/** 站内相对链接改绝对地址，订阅器里点击/加载资源不会落到聚合器域名。 */
function absolutizeLinks(html: string): string {
  return html.replace(
    /(href|src|poster)="\/(?!\/)/g,
    (_match, attribute: string) => `${attribute}="${siteUrl}/`
  );
}

/** CDATA 包裹；正文若含 `]]>` 先拆段，避免提前闭合。 */
function toCdata(html: string): string {
  return `<![CDATA[${html.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

/** 服务端把 Markdoc AST 渲染成完整正文 HTML，与独立页使用同一渲染链路。 */
function renderPostHtml(document: unknown): string {
  const html = renderToStaticMarkup(
    createElement(MarkdocContent, { nodes: document, headingIds: true })
  );
  // renderToStaticMarkup 会在相邻文本节点间插入空注释，去掉后正文更干净
  return absolutizeLinks(html.replace(/<!-- -->/g, ""));
}

export async function GET() {
  const posts = await loadPosts();
  const items = posts
    .map((post) => {
      const meta = categoryMeta[post.category] ?? categoryMeta.thinking;
      const content = renderPostHtml(post.document);
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${absoluteUrl(`/post/${encodeURIComponent(post.slug)}`)}</link>`,
        `      <guid isPermaLink="false">smartisan-blog:${escapeXml(post.slug)}</guid>`,
        `      <pubDate>${toRfc822(post.date)}</pubDate>`,
        `      <category>${escapeXml(meta.label)}</category>`,
        `      <description>${escapeXml(post.summary)}</description>`,
        `      <content:encoded>${toCdata(content)}</content:encoded>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
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
