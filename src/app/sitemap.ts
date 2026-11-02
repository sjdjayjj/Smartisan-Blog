import type { MetadataRoute } from "next";
import { loadPosts } from "@/lib/github";
import { loadNotes } from "@/lib/notes";
import { absoluteUrl } from "@/lib/seo";

/** 首页聚合全部公开内容，文章阅读态暂未拆分为独立路由，因此只提交根地址。 */
function latestDate(values: string[]): Date {
  const timestamps = values
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time));
  return timestamps.length ? new Date(Math.max(...timestamps)) : new Date();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, notes] = await Promise.all([loadPosts(), loadNotes()]);
  return [
    {
      url: absoluteUrl("/"),
      lastModified: latestDate([
        ...posts.map((post) => post.date),
        ...notes.map((note) => note.date),
      ]),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
