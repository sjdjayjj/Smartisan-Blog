"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FileText, Lightbulb, Plus, StickyNote, Trash2, X } from "lucide-react";
import { playMechanicalClick } from "@/lib/audio";
import { showToast } from "@/lib/bus";
import { useModalA11y } from "@/lib/useModalA11y";

/**
 * 灵感胶囊：作者侧快速捕获，不进入公开内容流。
 * 数据只存在 localStorage，随时可转为便签或文章草稿。
 */

type Tone = "gold" | "red" | "muted";

interface Idea {
  id: string;
  text: string;
  tone: Tone;
  createdAt: string;
}

const STORAGE_KEY = "smartisan:ideas";
const MAX_LENGTH = 280;
const MAX_ITEMS = 60;

const toneMeta: Record<Tone, { label: string; dot: string; ring: string }> = {
  gold: { label: "灵感", dot: "bg-smartisan-gold", ring: "border-smartisan-gold/40" },
  red: { label: "紧急", dot: "bg-smartisan-red", ring: "border-smartisan-red/40" },
  muted: { label: "归档", dot: "bg-smartisan-muted", ring: "border-smartisan-line-strong" },
};

function readTone(value: unknown): Tone {
  return value === "red" || value === "muted" ? value : "gold";
}

function readIdeas(): Idea[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items: unknown[] = parsed;
    return items
      .filter(
        (item): item is Idea =>
          Boolean(item) &&
          typeof (item as Idea).id === "string" &&
          typeof (item as Idea).text === "string" &&
          typeof (item as Idea).createdAt === "string"
      )
      .map((item) => ({
        ...item,
        tone: readTone(item.tone),
      }))
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function formatStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--.--";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** localStorage 作为唯一数据源，用外部 store 保证多标签页与首屏水合一致。 */
const EMPTY_IDEAS: Idea[] = [];
let ideaCache: Idea[] | null = null;
const ideaListeners = new Set<() => void>();

function getIdeasSnapshot(): Idea[] {
  if (ideaCache === null) ideaCache = readIdeas();
  return ideaCache;
}

function subscribeIdeas(listener: () => void) {
  ideaListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    ideaCache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    ideaListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeIdeas(next: Idea[]) {
  ideaCache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    showToast("浏览器存储不可用，胶囊只保留在本次会话");
  }
  ideaListeners.forEach((listener) => listener());
}

export default function IdeaPills() {
  const ideas = useSyncExternalStore(subscribeIdeas, getIdeasSnapshot, () => EMPTY_IDEAS);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [tone, setTone] = useState<Tone>("gold");
  const panelRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useModalA11y({
    open,
    containerRef: panelRef,
    onClose: () => setOpen(false),
    autofocusSelector: "textarea",
  });

  const add = () => {
    const value = text.trim();
    if (!value) {
      showToast("先写下一条灵感");
      return;
    }
    const idea: Idea = {
      id: makeId(),
      text: value,
      tone,
      createdAt: new Date().toISOString(),
    };
    writeIdeas([idea, ...ideas].slice(0, MAX_ITEMS));
    setText("");
    playMechanicalClick(1050, 0.05);
    showToast("已装进胶囊");
  };

  const remove = (id: string) => {
    writeIdeas(ideas.filter((idea) => idea.id !== id));
    playMechanicalClick(320, 0.03);
    showToast("胶囊已丢弃");
  };

  const remaining = MAX_LENGTH - text.length;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          playMechanicalClick(880, 0.04);
          setOpen(true);
        }}
        aria-label="打开灵感胶囊"
        aria-haspopup="dialog"
        title="灵感胶囊"
        className="tap-44-y relative st-btn flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-mono text-smartisan-muted hover:text-smartisan-ink transition"
      >
        <Lightbulb size={13} className="text-smartisan-gold" />
        <span className="hidden sm:inline">灵感</span>
        <span className="text-[10px] text-smartisan-gold tabular-nums">
          {String(ideas.length).padStart(2, "0")}
        </span>
      </button>

      {open
        ? createPortal(
        <>
          <div
            className="fixed inset-0 z-50 bg-smartisan-scrim-soft backdrop-blur-sm animate-fadeIn"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="灵感胶囊"
            className="fixed right-0 top-0 z-50 h-[100dvh] w-[min(92vw,380px)] safe-panel bg-smartisan-header border-l border-smartisan-line shadow-2xl flex flex-col animate-capsuleIn"
          >
            <header className="px-5 py-4 border-b border-smartisan-line flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-smartisan-gold shadow-gold-glow" />
                <div>
                  <h2 className="font-serif text-base font-bold text-smartisan-ink tracking-wider">
                    灵感胶囊
                  </h2>
                  <p className="font-mono text-[9px] text-smartisan-muted tracking-[0.18em]">
                    IDEA CAPSULES · AUTHOR ONLY
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭灵感胶囊"
                className="tap-44 relative w-8 h-8 rounded-full bg-smartisan-socket border border-smartisan-line text-smartisan-muted hover:text-smartisan-ink flex items-center justify-center"
              >
                <X size={13} />
              </button>
            </header>

            <div className="px-5 py-4 border-b border-smartisan-hairline space-y-3">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(event) => setText(event.target.value.slice(0, MAX_LENGTH))}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    add();
                  }
                }}
                rows={3}
                maxLength={MAX_LENGTH}
                placeholder="一句话、一个标题、一段没写完的念头…"
                className="st-well w-full rounded-xl px-3.5 py-3 text-sm font-serif text-smartisan-text placeholder:text-smartisan-muted/60 resize-none outline-none focus:ring-1 focus:ring-smartisan-red/40"
              />

              <div className="flex items-center gap-2">
                {(Object.keys(toneMeta) as Tone[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTone(key)}
                    aria-pressed={tone === key}
                    className={`tap-44-y relative st-btn flex-1 rounded-lg px-2 py-1.5 text-[11px] font-sans flex items-center justify-center gap-1.5 transition ${
                      tone === key
                        ? `text-smartisan-ink ${toneMeta[key].ring}`
                        : "text-smartisan-muted"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${toneMeta[key].dot}`} />
                    {toneMeta[key].label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] text-smartisan-muted tabular-nums">
                  {remaining} CHARS LEFT · ⌘/CTRL + ENTER
                </span>
                <button
                  type="button"
                  onClick={add}
                  disabled={!text.trim()}
                  className="tap-44-y relative st-btn px-4 py-2 rounded-lg text-[11px] font-sans text-smartisan-ink flex items-center gap-1.5 disabled:opacity-45"
                >
                  <Plus size={12} className="text-smartisan-red" />
                  装进胶囊
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto st-scroll-contain px-5 py-4 space-y-3">
              <div className="flex items-center justify-between border-b border-smartisan-hairline pb-2">
                <span className="font-mono text-[10px] text-smartisan-muted tracking-widest">
                  已存胶囊
                </span>
                <span className="font-mono text-[10px] text-smartisan-muted tabular-nums">
                  {String(ideas.length).padStart(2, "0")} ENTRIES
                </span>
              </div>

              {ideas.length === 0 ? (
                <div className="st-well rounded-xl px-4 py-8 text-center">
                  <Lightbulb size={18} className="mx-auto text-smartisan-muted/60" />
                  <p className="mt-2 font-serif text-xs text-smartisan-muted">
                    还没有胶囊。灵感来的时候，先把它扣在这里。
                  </p>
                </div>
              ) : (
                ideas.map((idea) => {
                  const meta = toneMeta[idea.tone];
                  return (
                    <article
                      key={idea.id}
                      className={`st-card rounded-xl p-3.5 border ${meta.ring}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-smartisan-muted">
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                        <span className="font-mono text-[9px] text-smartisan-muted tabular-nums">
                          {formatStamp(idea.createdAt)}
                        </span>
                      </div>

                      <p className="mt-2 font-serif text-sm text-smartisan-text leading-relaxed whitespace-pre-wrap break-words">
                        {idea.text}
                      </p>

                      <div className="mt-3 pt-2.5 border-t border-smartisan-hairline flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/account/notes/editor?draft=${encodeURIComponent(idea.text)}`}
                          onClick={() => {
                            playMechanicalClick(900, 0.04);
                            setOpen(false);
                          }}
                          className="tap-44-y relative st-btn px-2.5 py-1 rounded-md text-[10px] font-sans text-smartisan-text hover:text-smartisan-ink flex items-center gap-1.5"
                        >
                          <StickyNote size={10} className="text-smartisan-gold" />
                          转为便签
                        </Link>
                        <Link
                          href={`/account/editor?draft=${encodeURIComponent(idea.text)}`}
                          onClick={() => {
                            playMechanicalClick(900, 0.04);
                            setOpen(false);
                          }}
                          className="tap-44-y relative st-btn px-2.5 py-1 rounded-md text-[10px] font-sans text-smartisan-muted hover:text-smartisan-ink flex items-center gap-1.5"
                        >
                          <FileText size={10} className="text-smartisan-red" />
                          转为文章
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(idea.id)}
                          aria-label="丢弃这条胶囊"
                          title="丢弃这条胶囊"
                          className="ml-auto w-11 h-11 rounded-md text-smartisan-muted hover:text-smartisan-red flex items-center justify-center transition"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </aside>
        </>,
        document.body
      )
        : null}
    </>
  );
}
