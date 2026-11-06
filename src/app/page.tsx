import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import FeaturedNote from "@/components/FeaturedNote";
import ArticleGrid from "@/components/ArticleGrid";
import GadgetDeck from "@/components/gadgets/GadgetDeck";
import NoteModal from "@/components/NoteModal";
import Toast from "@/components/Toast";
import SoundEffects from "@/components/SoundEffects";
import ReadingProgress from "@/components/ReadingProgress";
import LevelBubble from "@/components/LevelBubble";
import type { Metadata } from "next";
import { site } from "@/lib/site";
import { serializeJsonLd, websiteJsonLd } from "@/lib/seo";
import { getSession, isAdmin } from "@/lib/auth";
import { loadPostsWithStatus } from "@/lib/github";
import { loadNotesWithStatus, type NoteShare } from "@/lib/notes";

// 文章与便签来自 GitHub 仓库（或本地文件），后台保存后即时生效
export const instant = false;

/**
 * 首页 canonical 指向根地址，`/?post=<slug>` 的弹窗深链仍可访问，
 * 但不与 /post/<slug> 形成重复索引。
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** 按最早一篇内容的日期计算坚守天数；放在组件外，避免渲染期调用非纯函数。 */
function daysSinceFirstContent(dates: string[]): number {
  const first = dates.filter(Boolean).sort()[0];
  if (!first) return 1;
  const time = new Date(first).getTime();
  if (Number.isNaN(time)) return 1;
  return Math.max(1, Math.ceil((Date.now() - time) / 86400000));
}

export default async function HomePage() {
  const [postsResult, notesResult, user] = await Promise.all([
    loadPostsWithStatus(),
    loadNotesWithStatus(),
    getSession(),
  ]);
  const posts = postsResult.posts;
  const notes = notesResult.notes;
  // 远端内容源降级时列表仍可用，但顶部要给出非阻断提示，避免静默展示旧数据
  const degraded = postsResult.degraded || notesResult.degraded;
  const canEdit = isAdmin(user);

  // 统计不写死：篇数取真实内容，天数从最早一篇内容算起
  const days = daysSinceFirstContent([
    ...posts.map((post) => post.date),
    ...notes.map((note) => note.date),
  ]);
  const stats = [
    { value: String(posts.length), label: "思考篇章", tone: "text-smartisan-text" },
    { value: String(notes.length), label: "便签闪念", tone: "text-smartisan-gold" },
    { value: days.toLocaleString("en-US"), label: "偏执天数", tone: "text-smartisan-red" },
  ];

  // 列表只下沉卡片需要的摘要字段；正文由 /api/post/[slug] 在打开弹窗时按需加载，
  // 避免全部 Markdoc AST 一次性进入首屏 RSC payload
  const postCards = posts.map(({ slug, title, date, category, summary, readTime }) => ({
    slug,
    title,
    date,
    category,
    summary,
    readTime,
  }));

  const noteShares: NoteShare[] = notes.map((note) => ({
    slug: note.slug,
    title: note.title,
    date: note.date,
    paragraphs: note.paragraphs,
  }));

  return (
    <main id="main-content" className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd()) }}
      />
      <Navbar canEdit={canEdit} />
      <SoundEffects />
      <ReadingProgress />
      <LevelBubble />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex-1 w-full space-y-12">
        <Hero avatar={user?.avatar ?? null} login={user?.login ?? null} stats={stats} />
        <FeaturedNote notes={notes} canEdit={canEdit} />
        <ArticleGrid posts={postCards} degraded={degraded} />
        <GadgetDeck />

        {/* 关于作者与站点 */}
        <section id="about" className="st-well rounded-2xl p-6 sm:p-10 space-y-6 scroll-mt-24">
          <div className="max-w-3xl space-y-4">
            <h2 className="font-serif text-2xl font-bold text-smartisan-ink">关于作者与这个站点</h2>
            <p className="font-serif text-sm sm:text-base text-smartisan-text leading-relaxed">
              本站是一个向 Smartisan OS、锤子科技与工业设计黄金时代致敬的独立数字空间。在这里，我们拒绝粗暴简陋的千篇一律，崇尚严谨的物理光影对齐、精准的排版间距与人文关怀。
            </p>
            <div className="pt-2 flex flex-wrap gap-4 text-xs font-mono text-smartisan-muted">
              <span>
                <strong className="text-smartisan-ink">DESIGN SPEC:</strong> {site.handle}
              </span>
              <span>
                <strong className="text-smartisan-ink">STACK:</strong> Next.js / Tailwind CSS / GitHub Contents API
              </span>
              <span>
                <strong className="text-smartisan-ink">LOCATION:</strong> 0x1C1C1E Space
              </span>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-smartisan-hairline bg-smartisan-sunken py-8 text-center text-xs text-smartisan-muted font-sans">
        <div className="max-w-6xl mx-auto px-4 space-y-2">
          <div className="flex justify-center items-center gap-2 font-serif text-smartisan-text">
            <span>{site.footerQuote}</span>
          </div>
          <p className="font-mono text-[11px] text-smartisan-faint">{site.footerNote}</p>
        </div>
      </footer>

      <NoteModal notes={noteShares} />
      <Toast />
    </main>
  );
}
