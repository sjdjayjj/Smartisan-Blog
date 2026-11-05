import Link from "next/link";
import { Hammer, Home } from "lucide-react";

/** 404：用「查无此页」红章 + 断裂网格表达“这一页被拆掉了”。 */
export const metadata = {
  title: "查无此页 · 404",
};

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="min-h-screen flex items-center justify-center p-4 sm:p-8 relative overflow-hidden"
    >
      <div className="not-found-grid absolute inset-0 pointer-events-none" aria-hidden="true" />

      <div className="st-card rounded-2xl border border-smartisan-line p-8 sm:p-12 max-w-md w-full text-center relative animate-riseIn">
        <span className="absolute top-3 left-3 w-1.5 h-1.5 rounded-full bg-smartisan-red shadow-red-glow" />

        <div className="st-seal inline-block px-4 py-2 text-2xl font-serif font-bold tracking-[0.3em] mb-6">
          查无此页
        </div>

        <p className="font-mono text-[11px] text-smartisan-muted tracking-[0.35em] uppercase">
          Error 404 · Page Not Found
        </p>

        <h1 className="font-serif text-2xl font-bold text-smartisan-ink mt-4 leading-snug">
          这一页，被工匠拆掉了
        </h1>
        <p className="text-xs text-smartisan-muted font-sans leading-relaxed mt-3">
          链接可能已随版本迭代锈蚀，或从未被真正打造出来。
          <br />
          比起将就，我们宁愿让它消失。
        </p>

        <div className="h-[1.5px] w-full my-7 bg-gradient-to-r from-transparent via-smartisan-red to-transparent shadow-red-glow" />

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <Link
            href="/"
            className="st-btn st-btn-lg font-mono text-smartisan-ink flex items-center justify-center gap-2"
          >
            <Home size={13} className="text-smartisan-red" />
            返回自留地
          </Link>
          <Link
            href="/#articles"
            className="st-btn st-btn-lg font-mono text-smartisan-muted hover:text-smartisan-ink flex items-center justify-center gap-2"
          >
            <Hammer size={13} className="text-smartisan-gold" />
            浏览九宫格文集
          </Link>
        </div>

        <p className="font-mono text-[10px] text-smartisan-faint mt-8 tracking-widest">
          THE CRAFTSMAN BLOG · 404
        </p>
      </div>
    </main>
  );
}
