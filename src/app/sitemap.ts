import type { MetadataRoute } from "next";
import { loadPosts } from "@/lib/github";
import { loadNotes } from "@/lib/notes";
import { absoluteUrl } from "@/lib/seo";

/** 首页聚合全部公开内容；单篇文章由 /post/[slug] 独立路由承载，逐条提交。 */
function latestDate(values: string[]): Date {
  const timestamps = values
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time));
  return timestamps.length ? new Date(Math.max(...timestamps)) : new Date();
}

/** 文章日期缺失或非法时交给首页的聚合时间兜底，避免 sitemap 出现 Invalid Date。 */
function postDate(value: string, fallback: Date): Date {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? fallback : new Date(time);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, notes] = await Promise.all([loadPosts(), loadNotes()]);
  const homeLastModified = latestDate([
    ...posts.map((post) => post.date),
    ...notes.map((note) => note.date),
  ]);

  return [
    {
      url: absoluteUrl("/"),
      lastModified: homeLastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    ...posts.map((post) => ({
      url: absoluteUrl(`/post/${post.slug}`),
      lastModified: postDate(post.date, homeLastModified),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
