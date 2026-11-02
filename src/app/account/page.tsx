import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, FilePlus2, FolderGit2, HardDrive, PencilLine, StickyNote } from "lucide-react";
import AccountHeader from "@/components/account/AccountHeader";
import UserAvatar from "@/components/UserAvatar";
import Toast from "@/components/Toast";
import SoundEffects from "@/components/SoundEffects";
import { getSession, isAdmin } from "@/lib/auth";
import { githubReady, loadPosts } from "@/lib/github";
import { loadNotes } from "@/lib/notes";
import { isR2Configured } from "@/lib/r2";
import { categoryMeta } from "@/lib/site";

export const instant = false;

export default async function AccountPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/login?error=not_allowed");

  const [posts, notes] = await Promise.all([loadPosts(), loadNotes()]);
  const remote = githubReady();

  return (
    <main className="min-h-screen flex flex-col">
      <AccountHeader user={user} />
      <SoundEffects />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex-1 w-full space-y-8">
        {/* 用户卡片 */}
        <section className="st-card rounded-2xl p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-5 right-5 st-seal text-[10px]">工匠出品</div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <UserAvatar
              avatar={user.avatar}
              login={user.login}
              size={64}
              className="w-16 h-16 rounded-full border border-smartisan-line-strong shadow-lg shadow-smartisan-shadow object-cover"
              fallback={
                <div className="w-16 h-16 rounded-full bg-smartisan-socket border border-smartisan-line-strong" />
              }
            />
            <div className="space-y-1 min-w-0">
              <h1 className="font-serif text-xl sm:text-2xl font-bold text-smartisan-ink truncate">
                {user.name}
              </h1>
              <a
                href={user.profile}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-smartisan-gold hover:underline underline-offset-4"
              >
                @{user.login}
              </a>
              <p className="text-xs text-smartisan-muted font-sans">
                站长账号 · 拥有文章与便签的新增、编辑与删除权限
              </p>
            </div>
            <div className="sm:ml-auto">
              <Link
                href="/account/editor"
                className="st-btn px-5 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-sans text-smartisan-ink"
              >
                <FilePlus2 size={15} className="text-smartisan-red" />
                新增文章
              </Link>
            </div>
          </div>
        </section>

        {/* 状态凹槽 */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="st-well rounded-xl p-4">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              <CalendarDays size={12} />
              Articles
            </div>
            <div className="mt-2 font-serif text-2xl font-bold text-smartisan-ink">{posts.length}</div>
            <div className="text-[11px] text-smartisan-muted font-sans">篇已发布文章</div>
          </div>
          <div className="st-well rounded-xl p-4">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              <FolderGit2 size={12} />
              Content Source
            </div>
            <div className="mt-2 font-serif text-lg font-bold text-smartisan-ink">
              {remote ? "GitHub 仓库" : "本地文件"}
            </div>
            <div className="text-[11px] text-smartisan-muted font-sans">
              {remote ? "保存即生成 commit，线上即时生效" : "未配置仓库令牌，仅本地可写"}
            </div>
          </div>
          <div className="st-well rounded-xl p-4">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
              <HardDrive size={12} />
              Media / R2
            </div>
            <div className="mt-2 font-serif text-lg font-bold text-smartisan-ink">
              {isR2Configured() ? "已就绪" : "未配置"}
            </div>
            <div className="text-[11px] text-smartisan-muted font-sans">
              {isR2Configured() ? "支持图片 / 视频直传" : "可先粘贴外部资源链接"}
            </div>
          </div>
        </section>

        {/* 文章列表 */}
        <section className="space-y-4">
          <div className="flex items-end justify-between border-b border-smartisan-hairline pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-smartisan-gold shadow-gold-glow" />
              <h2 className="font-serif text-lg sm:text-xl font-bold text-smartisan-ink tracking-wider">
                文章管理
              </h2>
            </div>
            <span className="font-mono text-[10px] text-smartisan-muted tracking-widest">
              {posts.length} POSTS
            </span>
          </div>

          {posts.length === 0 ? (
            <div className="st-well rounded-xl p-10 text-center text-sm text-smartisan-muted font-sans">
              还没有文章，点击右上角「新增文章」写下第一篇。
            </div>
          ) : (
            <div className="space-y-2">
              {posts.map((post) => {
                const meta = categoryMeta[post.category] ?? categoryMeta.thinking;
                return (
                  <div
                    key={post.slug}
                    className="st-card rounded-xl px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${meta.badgeClass}`}>
                          {meta.badge}
                        </span>
                        <span className="font-mono text-[10px] text-smartisan-muted">
                          {post.date.replaceAll("-", ".")} · {post.readTime} MIN
                        </span>
                      </div>
                      <h3 className="font-serif text-base font-bold text-smartisan-ink truncate">
                        {post.title}
                      </h3>
                      <p className="text-[11px] text-smartisan-muted font-sans line-clamp-1">
                        {post.summary}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-smartisan-faint hidden lg:inline">
                        {post.slug}.mdoc
                      </span>
                      <Link
                        href={`/account/editor?slug=${encodeURIComponent(post.slug)}`}
                        className="st-btn px-4 py-2 rounded-lg text-xs font-sans text-smartisan-ink flex items-center gap-1.5"
                      >
                        <PencilLine size={12} className="text-smartisan-gold" />
                        编辑
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 便签列表 */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-smartisan-hairline pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-smartisan-red shadow-red-glow" />
              <h2 className="font-serif text-lg sm:text-xl font-bold text-smartisan-ink tracking-wider">
                便签管理
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-smartisan-muted tracking-widest">
                {notes.length} NOTES
              </span>
              <Link
                href="/account/notes/editor"
                className="st-btn px-4 py-2 rounded-lg text-xs font-sans text-smartisan-ink flex items-center gap-1.5"
              >
                <StickyNote size={12} className="text-smartisan-red" />
                新增便签
              </Link>
            </div>
          </div>

          {notes.length === 0 ? (
            <div className="st-well rounded-xl p-10 text-center text-sm text-smartisan-muted font-sans">
              还没有便签，点击右上角「新增便签」贴上第一条闪念。
            </div>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <div
                  key={note.slug}
                  className="st-card rounded-xl px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-smartisan-gold">{note.eyebrow}</span>
                      <span className="font-mono text-[10px] text-smartisan-muted">
                        {note.date.replaceAll("-", ".")} · {note.meta}
                      </span>
                    </div>
                    <h3 className="font-serif text-base font-bold text-smartisan-ink truncate">
                      {note.title}
                    </h3>
                    <p className="text-[11px] text-smartisan-muted font-sans line-clamp-1">
                      {note.plain}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] text-smartisan-faint hidden lg:inline">
                      {note.slug}.mdoc
                    </span>
                    <Link
                      href={`/account/notes/editor?slug=${encodeURIComponent(note.slug)}`}
                      className="st-btn px-4 py-2 rounded-lg text-xs font-sans text-smartisan-ink flex items-center gap-1.5"
                    >
                      <PencilLine size={12} className="text-smartisan-gold" />
                      编辑
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="border-t border-smartisan-hairline bg-smartisan-sunken py-6 text-center font-mono text-[10px] text-smartisan-faint">
        SMARTISAN STUDIO · CONTENT PIPELINE V1
      </footer>

      <Toast />
    </main>
  );
}
