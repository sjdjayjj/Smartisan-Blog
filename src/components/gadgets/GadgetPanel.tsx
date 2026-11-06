import type { ReactNode } from "react";

/**
 * 三张桌面模块卡的共用外壳。
 * 只负责统一的头部节奏、内容区伸缩与底部操作区高度，
 * 具体内容由各面板传入，避免每个文件重复一遍 p-5 / h-6 / h-9。
 */
export default function GadgetPanel({
  title,
  meta,
  footer,
  children,
}: {
  title: string;
  meta: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="st-card rounded-xl p-5 flex flex-col">
      <div className="h-6 flex items-center justify-between gap-3">
        <h3 className="font-serif text-base font-bold text-smartisan-ink truncate">
          {title}
        </h3>
        <span className="font-mono text-[10px] text-smartisan-muted tracking-widest whitespace-nowrap">
          {meta}
        </span>
      </div>

      {/* 内容区吃掉剩余高度：卡片被 grid 拉伸到等高时，底部操作区仍贴底对齐 */}
      <div className="flex-1 min-h-0 mt-3 flex flex-col">{children}</div>

      <div className="h-9 mt-4 flex items-center justify-between gap-2">{footer}</div>
    </section>
  );
}
