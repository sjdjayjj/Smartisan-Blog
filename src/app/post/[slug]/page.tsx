import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import ArticleBody from "@/components/ArticleBody";
import Navbar from "@/components/Navbar";
import ReadingProgress from "@/components/ReadingProgress";
import { isValidSlug, loadPost } from "@/lib/github";
import { absoluteUrl } from "@/lib/seo";
import { categoryMeta, site } from "@/lib/site";

/**
 * 每篇文章的独立路由：服务端渲染完整正文，供搜索引擎与 RSS 直接抓取。
 * 站内点击卡片仍走 /?post=<slug> 的弹窗体验，两者共用 ArticleBody 渲染链路。
 * 内容来自远端仓库，与首页一样关闭 instant 预渲染校验。
 */
export const instant = false;

interface PostPageProps {
  params: Promise<{ slug: string }>;
}

/** 仅返回合法 ISO 字符串，避免脏数据让 metadata 抛错。 */
function isoDate(value: string): string | undefined {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function formatDate(date: string): string {
  return date.replaceAll("-", ".");
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = isValidSlug(slug) ? await loadPost(slug) : null;
  if (!post) return { title: "查无此页 · 404" };

  const title = `${post.title} · ${site.name}`;
  const description = post.summary || site.bio;
  const url = absoluteUrl(`/post/${slug}`);
  // 沿用站点根目录的 1200×630 分享图；标题为中文，动态生成会缺字
  const image = absoluteUrl("/opengraph-image");

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      locale: "zh_CN",
      siteName: site.name,
      title,
      description,
      url,
      publishedTime: isoDate(post.date),
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  // 非法 slug 与不存在的内容都返回真正的 404，而不是空白页
  if (!isValidSlug(slug)) notFound();
  const post = await loadPost(slug);
  if (!post) notFound();

  const meta = categoryMeta[post.category] ?? categoryMeta.thinking;

  return (
    <main id="main-content" className="min-h-screen flex flex-col">
      <Navbar />
      <ReadingProgress />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 flex-1 w-full">
        <article className="st-card rounded-2xl p-6 sm:p-10 border border-smartisan-line space-y-6">
          <header className="space-y-3">
            <span className={`font-mono text-xs px-2 py-0.5 rounded ${meta.badgeClass}`}>
              {meta.badge}
            </span>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-smartisan-ink leading-snug">
              {post.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-smartisan-muted">
              <span>{formatDate(post.date)}</span>
              <span>•</span>
              <span>{post.readTime} MIN READ</span>
            </div>
          </header>

          {/* 细红线分割：与弹窗阅读态保持同一视觉语法 */}
          <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-smartisan-red to-transparent shadow-red-glow" />

          <ArticleBody nodes={post.document} />

          <div className="pt-6 border-t border-smartisan-line flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-smartisan-muted">
            <span>THE CRAFTSMAN BLOG</span>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/#articles"
                className="st-btn tap-44-y relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-smartisan-muted hover:text-smartisan-ink"
              >
                <ArrowLeft size={12} className="text-smartisan-gold" />
                全部文集
              </Link>
              <Link
                href="/"
                className="st-btn tap-44-y relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-smartisan-ink"
              >
                <Home size={12} className="text-smartisan-red" />
                返回自留地
              </Link>
            </div>
          </div>
        </article>
      </div>

      <footer className="border-t border-smartisan-hairline bg-smartisan-sunken py-8 text-center text-xs text-smartisan-muted font-sans">
        <div className="max-w-6xl mx-auto px-4 space-y-2">
          <div className="flex justify-center items-center gap-2 font-serif text-smartisan-text">
            <span>{site.footerQuote}</span>
          </div>
          <p className="font-mono text-[11px] text-smartisan-faint">{site.footerNote}</p>
        </div>
      </footer>
    </main>
  );
}
