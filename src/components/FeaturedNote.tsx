"use client";

import Link from "next/link";
import { ArrowUpRight, PencilLine, Plus } from "lucide-react";
import MarkdocContent from "@/components/MarkdocContent";
import WaxSeal from "@/components/WaxSeal";
import { openNoteModal } from "@/lib/bus";
import type { NoteEntry } from "@/lib/notes";

/**
 * 便签区：最新一条以典藏便签纸完整呈现，其余便签以紧凑纸卡顺次堆叠。
 * 管理员编辑入口固定在 CLASSIC NOTE SYSTEM 一侧，符合“便签是即时事件”的定位。
 */
export default function FeaturedNote({
  notes,
  canEdit,
}: {
  notes: NoteEntry[];
  canEdit: boolean;
}) {
  const latest = notes[0] ?? null;

  return (
    <section id="note" className="space-y-4 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-smartisan-red shadow-red-glow" />
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-smartisan-ink tracking-wider">
            锤子便签 · 精选随笔
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline font-mono text-[10px] sm:text-xs text-smartisan-muted tracking-widest">
            CLASSIC NOTE SYSTEM
          </span>
          {canEdit ? (
            <Link
              href="/account/notes/editor"
              className="tap-44-y relative st-btn st-btn-sm font-sans text-smartisan-text flex items-center gap-1.5 hover:text-smartisan-ink"
            >
              <Plus size={12} className="text-smartisan-red" />
              新增便签
            </Link>
          ) : null}
          {canEdit && latest ? (
            <Link
              href={`/account/notes/editor?slug=${encodeURIComponent(latest.slug)}`}
              className="tap-44-y relative st-btn st-btn-sm font-sans text-smartisan-text flex items-center gap-1.5 hover:text-smartisan-ink"
            >
              <PencilLine size={12} className="text-smartisan-gold" />
              编辑便签
            </Link>
          ) : null}
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="st-well rounded-xl p-10 text-center text-sm text-smartisan-muted font-sans">
          还没有便签。
          {canEdit ? (
            <>
              {" "}
              前往{" "}
              <Link href="/account/notes/editor" className="text-smartisan-gold underline underline-offset-4">
                工坊
              </Link>{" "}
              写下第一条闪念。
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((note, index) => {
            const lead = index === 0;
            return (
              <article
                key={note.slug}
                className={`st-note-paper rounded-2xl border border-smartisan-line relative transition hover:border-smartisan-line-strong ${
                  lead ? "p-6 sm:p-9" : "p-5 sm:p-7"
                }`}
              >
                {/* 顶部夹扣 */}
                <div className="absolute -top-2 left-10 w-12 h-4 bg-gradient-to-b from-smartisan-metal to-smartisan-metal-deep rounded-t-sm border-t border-x border-smartisan-line-strong shadow-md" />

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-smartisan-hairline pb-4 mb-6 gap-3">
                  <div>
                    <span className="text-xs font-mono text-smartisan-gold uppercase tracking-wider">
                      {note.eyebrow}
                    </span>
                    <h3
                      className={`font-serif font-bold text-smartisan-ink mt-1 ${
                        lead ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"
                      }`}
                    >
                      {note.title}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                    <span className="font-mono text-xs text-smartisan-muted">
                      {note.date.replaceAll("-", ".")} · {note.meta}
                    </span>
                    {lead ? (
                      <span className="font-mono text-[10px] text-smartisan-gold tracking-widest">
                        LATEST
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openNoteModal(note.slug)}
                      aria-label={`为《${note.title}》生成便签长图`}
                      className="tap-44-y relative st-btn st-btn-sm font-sans text-smartisan-text flex items-center gap-1.5 hover:text-smartisan-ink"
                    >
                      <ArrowUpRight size={12} className="text-smartisan-red" />
                      生成便签长图
                    </button>
                  </div>
                </div>

                <div className="article-body max-w-4xl">
                  <MarkdocContent nodes={note.document} />
                </div>

                {lead ? (
                  <div className="mt-8 pt-4 border-t border-smartisan-hairline flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-smartisan-socket border border-smartisan-line flex items-center justify-center text-xs font-serif text-smartisan-gold">
                        锤
                      </div>
                      <span className="font-serif text-xs text-smartisan-muted">
                        发布自 锤子便签 · Smartisan OS
                      </span>
                    </div>
                    <WaxSeal
                      lines={["工匠出品", "骄傲制造"]}
                      size={84}
                      rotation={-5}
                      label="工匠出品 · 骄傲制造"
                      className="w-[74px] h-[74px] sm:w-[84px] sm:h-[84px] -mb-2"
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
