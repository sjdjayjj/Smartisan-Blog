"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Hammer, Menu, X } from "lucide-react";
import IdeaPills from "@/components/IdeaPills";
import ThemeToggle from "@/components/ThemeToggle";
import { navItems, site } from "@/lib/site";
import { useModalA11y } from "@/lib/useModalA11y";

export default function Navbar({ canEdit = false }: { canEdit?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);

  useModalA11y({
    open: menuOpen,
    containerRef: drawerRef,
    onClose: () => setMenuOpen(false),
    autofocusSelector: "a[href]",
  });

  return (
    <>
      <header className="sticky top-0 z-40 bg-smartisan-header/90 backdrop-blur-md border-b border-smartisan-hairline st-fine-red-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo 与站名 */}
        <Link href="/" className="tap-44-y relative flex items-center gap-3 group min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-b from-smartisan-metal to-smartisan-metal-deep border border-smartisan-line flex items-center justify-center shadow-md shadow-smartisan-shadow relative overflow-hidden group-hover:border-smartisan-red/50 transition">
            <div className="absolute inset-0 bg-smartisan-red/10 opacity-0 group-hover:opacity-100 transition" />
            <svg
              className="w-4 h-4 text-smartisan-red relative"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M19.4 6.6L17.4 4.6C16.8 4 15.8 4 15.2 4.6L12.7 7.1L16.9 11.3L19.4 8.8C20 8.2 20 7.2 19.4 6.6ZM4 17.2V20H6.8L15.5 11.3L12.7 8.5L4 17.2Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <span className="block font-serif font-bold text-sm sm:text-lg tracking-wider text-smartisan-text group-hover:text-smartisan-ink transition whitespace-nowrap">
              {site.name}
            </span>
            <span className="hidden sm:block font-mono text-[10px] tracking-widest text-smartisan-muted uppercase whitespace-nowrap">
              {site.tagline}
            </span>
          </div>
        </Link>

        {/* 导航 */}
        <nav className="hidden md:flex items-center space-x-1 font-sans text-sm">
          {navItems.map((item) =>
            item.dot ? (
              <a
                key={item.href}
                href={item.href}
                className="tap-44-y relative px-4 py-2 rounded-lg text-smartisan-text hover:text-smartisan-ink hover:bg-smartisan-veil transition flex items-center gap-1.5 font-medium"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-smartisan-red inline-block" />
                {item.label}
              </a>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className="tap-44-y relative px-4 py-2 rounded-lg text-smartisan-muted hover:text-smartisan-ink hover:bg-smartisan-veil transition font-medium"
              >
                {item.label}
              </a>
            )
          )}
        </nav>

        {/* 右侧控件：作者入口、灵感胶囊与主题拨杆，整体贴右 */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
          {canEdit ? <IdeaPills /> : null}
          <Link
            href="/account"
            title="作者入口"
            className="tap-44-y relative hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono text-smartisan-muted hover:text-smartisan-ink hover:bg-smartisan-veil transition"
          >
            <Hammer size={13} />
            工坊
          </Link>
          <span className="sm:hidden">
            <ThemeToggle variant="compact" />
          </span>
          <span className="hidden sm:inline-flex">
            <ThemeToggle />
          </span>

          {/* 移动端抽屉开关 */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "关闭导航菜单" : "打开导航菜单"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="tap-44 relative md:hidden st-btn st-btn-icon-md flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink"
          >
            {menuOpen ? <X size={15} /> : <Menu size={15} />}
          </button>
        </div>
      </div>
      </header>

      {/* 移动端抽屉：下拉面板 + 遮罩，点击条目或 Esc 关闭 */}
      {menuOpen ? (
        <>
          <div
            className="md:hidden fixed inset-0 top-16 z-30 bg-smartisan-scrim backdrop-blur-sm animate-fadeIn"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            ref={drawerRef}
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
            className="md:hidden fixed left-0 right-0 top-16 z-40 mx-3 mt-2 st-card rounded-2xl border border-smartisan-line p-2 origin-top animate-scaleUp"
          >
            {navItems.map((item, index) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between px-3 py-3 rounded-lg text-sm font-sans text-smartisan-text hover:bg-smartisan-veil transition"
              >
                <span className="flex items-center gap-2">
                  {item.dot ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-smartisan-red inline-block" />
                  ) : null}
                  {item.label}
                </span>
                <span className="font-mono text-[10px] text-smartisan-muted tracking-widest">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </a>
            ))}

            <div className="my-1.5 h-px bg-smartisan-veil" />

            {/* 主题外观：两档物理拨杆，与桌面端同源 */}
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg">
              <span className="font-sans text-sm text-smartisan-muted">主题外观</span>
              <ThemeToggle />
            </div>

            <Link
              href="/account"
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between px-3 py-3 rounded-lg text-sm font-sans text-smartisan-muted hover:bg-smartisan-veil hover:text-smartisan-ink transition"
            >
              <span className="flex items-center gap-2">
                <Hammer size={13} />
                作者工坊
              </span>
              <span className="font-mono text-[10px] tracking-widest">STUDIO</span>
            </Link>
          </nav>
        </>
      ) : null}
    </>
  );
}
