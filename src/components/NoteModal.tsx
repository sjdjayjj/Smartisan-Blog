"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import WaxSeal from "@/components/WaxSeal";
import { OPEN_NOTE_EVENT, showToast } from "@/lib/bus";
import { playMechanicalClick } from "@/lib/audio";
import { copyText } from "@/lib/clipboard";
import { exportNoteImage } from "@/lib/noteImage";
import { site } from "@/lib/site";
import { useModalA11y } from "@/lib/useModalA11y";
import type { NoteShare } from "@/lib/notes";

export default function NoteModal({ notes }: { notes: NoteShare[] }) {
  const [open, setOpen] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  /** 触屏兜底：分享不可用时展示可长按保存的长图预览 */
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const note =
    notes.find((item) => item.slug === activeSlug) ?? notes[0] ?? null;

  useEffect(() => {
    const onOpen = (event: Event) => {
      if (notes.length === 0) {
        showToast("暂无便签可供生成");
        return;
      }
      const slug =
        event instanceof CustomEvent ? (event.detail as string | undefined) : undefined;
      const target = slug ? notes.find((item) => item.slug === slug) : notes[0];
      if (!target) {
        showToast("这条便签已不存在");
        return;
      }
      setActiveSlug(target.slug);
      setOpen(true);
    };
    window.addEventListener(OPEN_NOTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_NOTE_EVENT, onOpen);
  }, [notes]);

  useModalA11y({
    open,
    containerRef: dialogRef,
    onClose: () => setOpen(false),
    autofocusSelector: "[data-modal-autofocus]",
  });

  // 预览层关闭或组件卸载时回收 objectURL，避免长图内存常驻
  useEffect(() => {
    const current = preview;
    return () => {
      if (current) URL.revokeObjectURL(current.url);
    };
  }, [preview]);

  if (!open || !note) return null;

  const close = () => {
    setPreview(null);
    playMechanicalClick(350, 0.03);
    setOpen(false);
  };

  const copy = async () => {
    const shareText = `【${note.title}】\n${note.paragraphs.join("\n\n")}\n—— ${site.name} (${site.handle})`;
    try {
      await copyText(shareText);
      showToast("便签内容已成功复制到剪贴板！");
    } catch {
      showToast("复制失败，请手动选取文本");
    }
  };

  const downloadImage = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const outcome = await exportNoteImage(note);
      // 长图落章：一声低沉机械音，像邮戳压到纸面上
      playMechanicalClick(180, 0.09);
      if (outcome.mode === "share") {
        showToast("便签长图已调起系统分享");
      } else if (outcome.mode === "preview") {
        setPreview({ url: outcome.url, filename: outcome.filename });
        showToast("长按图片即可保存到相册");
      } else {
        showToast("便签长图已导出为 PNG");
      }
    } catch {
      showToast("长图导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {preview ? (
        <div
          className="fixed inset-0 z-[70] bg-smartisan-scrim backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label="便签长图预览"
        >
          <div
            className="flex flex-col items-center min-w-0 max-w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="font-mono text-[11px] tracking-widest text-smartisan-gold mb-3">
              长按图片保存到相册
            </p>
            {/* 长按触发系统「存储图像」，是 iOS 上唯一可靠的保存路径 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt="便签长图预览"
              className="max-h-[70dvh] w-auto max-w-full rounded-lg border border-smartisan-line-strong shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="tap-44-y relative st-btn st-btn-md mt-4 font-mono text-smartisan-ink"
            >
              完成
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="fixed inset-0 z-50 bg-smartisan-scrim backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
        onClick={close}
        role="dialog"
        aria-modal="true"
        aria-label="锤子便签 · 精选分享长图"
      >
      <div
        ref={dialogRef}
        className="max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto st-note-paper rounded-2xl p-6 sm:p-8 border border-smartisan-line-strong shadow-2xl relative animate-scaleUp"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          data-modal-autofocus
          onClick={close}
          aria-label="关闭便签"
          className="tap-44 absolute top-4 right-4 w-9 h-9 rounded-full bg-smartisan-socket border border-smartisan-line text-smartisan-muted hover:text-smartisan-ink flex items-center justify-center"
        >
          <X size={13} />
        </button>

        <div className="text-center pb-4 border-b border-smartisan-line mb-4">
          <div className="w-10 h-10 mx-auto rounded-full bg-smartisan-socket border border-smartisan-line flex items-center justify-center text-base font-serif text-smartisan-red mb-2">
            锤
          </div>
          <h4 className="font-serif text-lg font-bold text-smartisan-ink">锤子便签 · 精选分享长图</h4>
          <p className="font-mono text-[10px] text-smartisan-muted">
            SMARTISAN NOTES GENERATOR
          </p>
        </div>

        <div className="font-serif text-sm text-smartisan-text leading-relaxed space-y-3 py-2">
          <p className="font-bold text-base text-smartisan-ink">{note.title}</p>
          {note.paragraphs.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 8)}`}>{paragraph}</p>
          ))}
        </div>

        <div className="pt-4 border-t border-smartisan-line flex items-center justify-between mt-4">
          <div className="font-mono text-[11px] text-smartisan-muted">
            {note.date.replaceAll("-", ".")} / {site.name}
          </div>
          <WaxSeal
            lines={["天生", "骄傲"]}
            size={56}
            rotation={-4}
            label="天生骄傲"
            className="w-12 h-12 sm:w-14 sm:h-14"
          />
        </div>

        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            onClick={downloadImage}
            disabled={exporting}
            className="tap-44-y relative st-btn st-btn-lg w-full font-mono text-smartisan-ink flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Download size={13} className="text-smartisan-red" />
            {exporting ? "正在导出长图…" : "导出便签长图 PNG"}
          </button>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={copy}
              className="tap-44-y relative st-btn st-btn-lg flex-1 font-mono text-smartisan-text flex items-center justify-center gap-2"
            >
              复制便签正文
            </button>
            <button
              type="button"
              onClick={close}
              className="tap-44-y relative st-btn st-btn-lg font-mono text-smartisan-muted hover:text-smartisan-ink"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
