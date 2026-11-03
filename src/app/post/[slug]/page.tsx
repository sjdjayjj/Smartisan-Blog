import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import Navbar from "@/components/Navbar";
import PostReader from "@/components/PostReader";
import ReadingProgress from "@/components/ReadingProgress";
import { isValidSlug, loadPostWithStatus } from "@/lib/github";
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
  const result = isValidSlug(slug)
    ? await loadPostWithStatus(slug)
    : ({ status: "not_found" } as const);
  if (result.status === "not_found") {
    return { title: "查无此页 · 404", robots: { index: false, follow: false } };
  }
  if (result.status === "unavailable") {
    // 内容源异常时不要把单篇标成可索引的正文
    return {
      title: `内容暂时不可用 · ${site.name}`,
      description: site.bio,
      robots: { index: false, follow: false },
    };
  }
  const post = result.post;

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

/** 内容源异常时的兜底面板：明确区别于「文章不存在」。 */
function UnavailablePanel() {
  return (
    <main id="main-content" className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 flex-1 w-full">
        <div
          className="st-card rounded-2xl p-8 border border-smartisan-line text-center space-y-4"
          role="alert"
        >
          <p className="font-mono text-[11px] tracking-widest text-smartisan-gold">
            CONTENT SOURCE UNAVAILABLE
          </p>
          <h1 className="font-serif text-2xl font-bold text-smartisan-ink">
            内容源暂时不可用
          </h1>
          <p className="text-sm font-sans text-smartisan-text leading-relaxed">
            文章仓库当前无法读取（网络或凭据异常），这不是「文章不存在」。稍后重试即可。
          </p>
          <Link
            href="/"
            className="st-btn tap-44-y relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-smartisan-ink"
          >
            <Home size={12} className="text-smartisan-red" />
            返回自留地
          </Link>
        </div>
      </div>
    </main>
  );
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  // 非法 slug 与不存在的内容都返回真正的 404，而不是空白页
  if (!isValidSlug(slug)) notFound();
  const result = await loadPostWithStatus(slug);
  if (result.status === "not_found") notFound();
  // 正常导航下 proxy 已对内容源异常返回 503；这里是直连 RSC 等路径的兜底，
  // 明确说明「内容源不可用」，不要伪装成 404 或空白页。
  if (result.status === "unavailable") return <UnavailablePanel />;
  const post = result.post;

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

          <PostReader
            slug={slug}
            title={post.title}
            summary={post.summary}
            nodes={post.document}
          />

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
