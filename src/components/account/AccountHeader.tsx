import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import UserAvatar from "@/components/UserAvatar";
import { site } from "@/lib/site";
import type { SessionUser } from "@/lib/auth";

/** 后台专用头部：沿用首页的细红线与拟物深色底，但导航切换为账户操作。 */
export default function AccountHeader({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-40 bg-smartisan-header/90 backdrop-blur-md border-b border-smartisan-hairline st-fine-red-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="w-9 h-9 rounded-full bg-gradient-to-b from-smartisan-metal to-smartisan-metal-deep border border-smartisan-line flex items-center justify-center shadow-md shadow-smartisan-shadow hover:border-smartisan-red/50 transition shrink-0"
            aria-label="返回首页"
          >
            <svg className="w-4 h-4 text-smartisan-red" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19.4 6.6L17.4 4.6C16.8 4 15.8 4 15.2 4.6L12.7 7.1L16.9 11.3L19.4 8.8C20 8.2 20 7.2 19.4 6.6ZM4 17.2V20H6.8L15.5 11.3L12.7 8.5L4 17.2Z" />
            </svg>
          </Link>
          <div className="min-w-0">
            <div className="font-serif font-bold text-sm text-smartisan-text truncate">
              {site.name} · 工坊
            </div>
            <div className="font-mono text-[10px] text-smartisan-muted tracking-widest uppercase">
              SMARTISAN STUDIO
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-sans text-smartisan-muted hover:text-smartisan-ink hover:bg-smartisan-veil transition"
          >
            <ArrowLeft size={13} />
            返回首页
          </Link>
          <span className="sm:hidden">
            <ThemeToggle variant="compact" />
          </span>
          <span className="hidden sm:inline-flex">
            <ThemeToggle />
          </span>
          <div className="flex items-center gap-2 h-9 px-2 rounded-full bg-smartisan-sunken border border-smartisan-hairline shadow-inner">
            <UserAvatar
              avatar={user.avatar}
              login={user.login}
              size={48}
              className="w-6 h-6 rounded-full border border-smartisan-line-strong object-cover"
            />
            <span className="font-mono text-[11px] text-smartisan-text max-w-[90px] truncate">
              @{user.login}
            </span>
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="st-btn st-btn-icon-md flex items-center justify-center text-smartisan-muted hover:text-smartisan-red"
              aria-label="退出登录"
              title="退出登录"
            >
              <LogOut size={13} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
