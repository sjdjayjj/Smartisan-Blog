"use client";

import { Feather, ScrollText } from "lucide-react";
import FlipCounter from "@/components/FlipCounter";
import UserAvatar from "@/components/UserAvatar";
import { openNoteModal } from "@/lib/bus";
import { site } from "@/lib/site";

export interface HeroStat {
  value: string;
  label: string;
  tone: string;
}

export default function Hero({
  avatar,
  login,
  stats,
}: {
  avatar?: string | null;
  login?: string | null;
  stats: HeroStat[];
}) {

  const scrollToArticles = () => {
    document.getElementById("articles")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="st-card rounded-2xl p-6 sm:p-10 relative overflow-hidden animate-riseIn">
      {/* 顶部环境高光 */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-smartisan-highlight to-transparent" />

      <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
        {/* 左：头像与主张 */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          {/* 2.5D 边框头像 */}
          <div className="relative group shrink-0">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl p-1 bg-gradient-to-b from-smartisan-metal to-smartisan-metal-deep shadow-2xl relative">
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-smartisan-red border-2 border-smartisan-metal-deep shadow-md shadow-smartisan-red/60 animate-pulse" />
              <div className="w-full h-full rounded-xl overflow-hidden bg-smartisan-socket border border-smartisan-line relative">
                <UserAvatar
                  avatar={avatar}
                  login={login}
                  size={192}
                  alt="GitHub 头像"
                  className="w-full h-full object-cover"
                  fallback={
                    <div className="w-full h-full bg-gradient-to-br from-smartisan-metal to-smartisan-metal-deep flex flex-col items-center justify-center text-center p-2">
                      <span className="font-serif text-3xl font-bold text-smartisan-gold">匠</span>
                      <span className="font-mono text-[9px] text-smartisan-muted tracking-tighter mt-1">
                        CRAFTSMAN
                      </span>
                    </div>
                  }
                />
                {/* 玻璃高光：让头像像嵌进金属边框 */}
                <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-smartisan-line bg-gradient-to-br from-white/10 via-transparent to-black/20" />
              </div>
            </div>
            <div className="text-center mt-2">
              <span className="font-mono text-[10px] text-smartisan-gold bg-smartisan-well px-2 py-0.5 rounded border border-smartisan-gold/20">
                PRO-BUILD 01
              </span>
            </div>
          </div>

          {/* 简介与核心信念 */}
          <div className="space-y-3 max-w-xl">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-smartisan-ink tracking-wide">
                {site.author}
              </h1>
              <span className="st-seal text-[11px] font-serif font-bold px-2 py-0.5 uppercase tracking-wider">
                天生骄傲
              </span>
            </div>

            <p className="font-serif text-base sm:text-lg text-smartisan-text leading-relaxed italic opacity-95">
              {site.quote}
            </p>

            <p className="text-xs sm:text-sm text-smartisan-muted leading-relaxed font-sans">
              {site.bio}
            </p>

            <div className="pt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
              <button
                type="button"
                onClick={scrollToArticles}
                className="tap-44-y relative st-btn px-4 py-1.5 rounded-lg text-xs font-mono text-smartisan-text flex items-center gap-2"
              >
                <ScrollText size={13} className="text-smartisan-red" />
                浏览文章库
              </button>
              <button
                type="button"
                onClick={() => openNoteModal()}
                className="tap-44-y relative st-btn px-4 py-1.5 rounded-lg text-xs font-mono text-smartisan-gold flex items-center gap-2"
              >
                <Feather size={13} />
                展开置顶便签
              </button>
            </div>
          </div>
        </div>

        {/* 右：内凹统计槽 */}
        <div className="st-well p-5 rounded-xl w-full lg:w-auto min-w-0 max-w-full grid grid-cols-3 gap-4 text-center divide-x divide-smartisan-hairline">
          {stats.map((item) => (
            <div key={item.label} className="min-w-0 px-2">
              <span className="flex justify-center">
                <FlipCounter
                  value={item.value}
                  className={`${item.tone} text-xl sm:text-2xl`}
                />
              </span>
              <span className="block text-[11px] text-smartisan-muted uppercase font-sans mt-0.5 break-words">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
