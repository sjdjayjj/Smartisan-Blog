"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { playMechanicalClick } from "@/lib/audio";
import { categoryFilters, type CategoryKey } from "@/lib/site";

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const WEEK_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_LABELS = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];

/** 弹层统一的金属面板材质 */
const POPOVER =
  "st-popover absolute top-[calc(100%_+_8px)] z-40 rounded-xl animate-scaleUp";

/**
 * 字段标题行：固定高度 + 右侧操作槽位绝对定位。
 *
 * 三列表单里只要有字段多出按钮，行高就会被按钮撑高，导致输入框顶边错位。
 * 这里把行高锁死在 h-6，操作区脱离文档流贴右居中，所有字段结构上就对齐，
 * 后续再加按钮也不会破坏排列。
 */
export function FieldLabel({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="relative flex h-6 items-center min-w-0">
      <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase truncate">
        {text}
      </span>
      {action ? (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {action}
        </div>
      ) : null}
    </div>
  );
}

const CATEGORY_DOT: Record<CategoryKey, string> = {
  aesthetic: "bg-smartisan-red shadow-red-glow",
  system: "bg-smartisan-gold shadow-gold-glow",
  thinking: "bg-smartisan-muted",
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDate(value: string): Date {
  const [y, m, d] = value
    .replace(/[./]/g, "-")
    .split("T")[0]
    .split("-")
    .map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function toValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function useDismiss(
  ref: RefObject<HTMLDivElement | null>,
  open: boolean,
  setOpen: (value: boolean) => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, open, setOpen]);
}

export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseDate(value), [value]);
  const [cursor, setCursor] = useState({ year: selected.getFullYear(), month: selected.getMonth() });

  useDismiss(wrapRef, open, setOpen);

  const today = new Date();
  const pretty = `${selected.getFullYear()} · ${pad2(selected.getMonth() + 1)} · ${pad2(selected.getDate())}`;
  const normalizedValue = toValue(selected);

  const days = useMemo(() => {
    const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
    const offset = (firstWeekday + 6) % 7; // 周一为起始
    const total = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const cells: Array<{ day: number; value: string } | null> = Array.from({ length: offset }, () => null);
    for (let day = 1; day <= total; day += 1) {
      cells.push({
        day,
        value: `${cursor.year}-${pad2(cursor.month + 1)}-${pad2(day)}`,
      });
    }
    return cells;
  }, [cursor]);

  const toggle = () => {
    playMechanicalClick(900, 0.04);
    if (!open) setCursor({ year: selected.getFullYear(), month: selected.getMonth() });
    setOpen(!open);
  };

  const shiftMonth = (step: number) => {
    playMechanicalClick(760, 0.03);
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + step, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const pick = (next: string) => {
    playMechanicalClick(1000, 0.04);
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`st-well w-full rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 text-left transition focus-visible:outline-1 focus-visible:outline-smartisan-red/50 ${
          open ? "outline-1 outline-smartisan-red/30" : ""
        }`}
      >
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="font-mono text-sm text-smartisan-text tracking-wide truncate">{pretty}</span>
          <span className="font-mono text-[10px] tracking-widest text-smartisan-muted">
            {WEEK_EN[selected.getDay()]}
          </span>
        </span>
        <Calendar size={13} className={`shrink-0 ${open ? "text-smartisan-red" : "text-smartisan-muted"}`} />
      </button>

      {open ? (
        <div
          className={`${POPOVER} left-0 origin-top-left w-[292px] max-w-[calc(100vw_-_2.5rem)] p-3`}
          role="dialog"
          aria-label="选择发布日期"
        >
          <div className="flex items-center justify-between gap-2 pb-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="上个月"
              className="st-btn w-7 h-7 rounded-md flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink"
            >
              <ChevronLeft size={13} />
            </button>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted">
                {cursor.year}
              </span>
              <span className="text-smartisan-faint">/</span>
              <span className="font-serif text-sm font-bold text-smartisan-ink">
                {MONTH_LABELS[cursor.month]}
              </span>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="下个月"
              className="st-btn w-7 h-7 rounded-md flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          <div className="h-[1px] w-full bg-smartisan-veil" />

          <div className="grid grid-cols-7 gap-0.5 pt-2">
            {WEEK_LABELS.map((label) => (
              <span
                key={label}
                className="h-6 flex items-center justify-center font-mono text-[10px] tracking-widest text-smartisan-muted/70"
              >
                {label}
              </span>
            ))}
            {days.map((cell, index) => {
              if (!cell) return <span key={`blank-${index}`} className="h-8" />;
              const isSelected = cell.value === normalizedValue;
              const isToday = cell.value === toValue(today);
              return (
                <button
                  key={cell.value}
                  type="button"
                  onClick={() => pick(cell.value)}
                  aria-pressed={isSelected}
                  className={`relative h-8 rounded-md font-mono text-[12px] transition outline-none focus-visible:ring-1 focus-visible:ring-smartisan-red/50 ${
                    isSelected
                      // 红色烤漆面在深浅两套主题里都是深底，文字必须保持纯白
                      ? "text-white bg-gradient-to-b from-smartisan-red-light to-smartisan-red-deep border border-white/20 shadow-[0_0_10px_rgba(212,35,42,0.45)]"
                      : isToday
                        ? "text-smartisan-gold hover:bg-smartisan-veil"
                        : "text-smartisan-text hover:bg-smartisan-veil hover:text-smartisan-ink"
                  }`}
                >
                  {cell.day}
                  {isToday && !isSelected ? (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-smartisan-gold" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-2 pt-2 border-t border-smartisan-hairline flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-widest text-smartisan-muted">
              {pretty.replace(/ · /g, ".")}
            </span>
            <button
              type="button"
              onClick={() => pick(toValue(new Date()))}
              className="font-mono text-[10px] tracking-widest text-smartisan-gold hover:text-smartisan-gold-light transition"
            >
              回到今天
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CategoryField({
  value,
  onChange,
}: {
  value: CategoryKey;
  onChange: (value: CategoryKey) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const options = categoryFilters.filter((item) => item.key !== "all");
  const current = options.find((item) => item.key === value) ?? options[0];

  useDismiss(wrapRef, open, setOpen);

  const toggle = () => {
    playMechanicalClick(900, 0.04);
    setOpen(!open);
  };

  const pick = (key: CategoryKey) => {
    playMechanicalClick(1000, 0.04);
    onChange(key);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`st-well w-full rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 text-left transition focus-visible:outline-1 focus-visible:outline-smartisan-red/50 ${
          open ? "outline-1 outline-smartisan-red/30" : ""
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CATEGORY_DOT[value]}`} />
          <span className="font-sans text-sm text-smartisan-text truncate">{current.label}</span>
          <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
            {current.en}
          </span>
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform duration-200 ${
            open ? "rotate-180 text-smartisan-red" : "text-smartisan-muted"
          }`}
        />
      </button>

      {open ? (
        <div
          className={`${POPOVER} left-0 origin-top-left w-full p-1.5`}
          role="listbox"
          aria-label="选择文章分类"
        >
          {options.map((item) => {
            const isSelected = item.key === value;
            return (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => pick(item.key as CategoryKey)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition ${
                  isSelected ? "bg-smartisan-red/10" : "hover:bg-smartisan-veil"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CATEGORY_DOT[item.key as CategoryKey]}`} />
                  <span
                    className={`font-sans text-sm truncate ${
                      isSelected ? "text-smartisan-ink" : "text-smartisan-text"
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                    {item.en}
                  </span>
                </span>
                {isSelected ? <Check size={12} className="shrink-0 text-smartisan-red" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
