"use client";

import {
  Bold,
  Code,
  Heading1,
  Heading2,
  ImagePlus,
  List,
  ListOrdered,
  Menu,
  MessageSquareQuote,
  Minus,
  X,
  type LucideIcon,
} from "lucide-react";
import { playMechanicalClick } from "@/lib/audio";
import { showToast } from "@/lib/bus";

type InsertFn = (before: string, after?: string) => void;

interface Tool {
  key: string;
  label: string;
  icon: LucideIcon;
  before?: string;
  after?: string;
  action?: () => void;
}

export default function EditorToolbar({
  onInsert,
  onUpload,
  showMenu,
  setShowMenu,
  r2Ready,
}: {
  onInsert: InsertFn;
  onUpload: () => void;
  showMenu: boolean;
  setShowMenu: (value: boolean) => void;
  r2Ready: boolean;
}) {
  const toggleMenu = () => {
    playMechanicalClick(850, 0.04);
    setShowMenu(!showMenu);
  };

  const insert = (before: string, after = "\n") => {
    playMechanicalClick(850, 0.04);
    onInsert(before, after);
  };

  const pickMedia = () => {
    playMechanicalClick(900, 0.04);
    if (!r2Ready) {
      showToast("R2 尚未配置，可在弹窗中粘贴外部资源链接");
    }
    onUpload();
  };

  const tools: Tool[] = [
    { key: "h1", label: "一级标题", icon: Heading1, before: "# ", after: "\n" },
    { key: "h2", label: "二级标题", icon: Heading2, before: "## ", after: "\n" },
    { key: "bold", label: "加粗", icon: Bold, before: "**", after: "**" },
    { key: "code", label: "行内代码", icon: Code, before: "`", after: "`" },
    { key: "ul", label: "无序列表", icon: List, before: "- ", after: "\n" },
    { key: "ol", label: "有序列表", icon: ListOrdered, before: "1. ", after: "\n" },
    { key: "quote", label: "引用", icon: MessageSquareQuote, before: "> ", after: "\n" },
    { key: "hr", label: "分隔线", icon: Minus, before: "\n---\n" },
    { key: "media", label: "插入媒体", icon: ImagePlus, action: pickMedia },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-smartisan-sunken rounded-xl p-2 border border-smartisan-hairline shadow-inner">
      <button
        type="button"
        onClick={toggleMenu}
        className={`st-btn w-9 h-9 rounded-lg flex items-center justify-center ${
          showMenu ? "text-smartisan-red" : "text-smartisan-muted hover:text-smartisan-ink"
        }`}
        aria-label={showMenu ? "收起工具栏" : "展开工具栏"}
        title={showMenu ? "收起工具栏" : "展开工具栏"}
      >
        {showMenu ? <X size={14} /> : <Menu size={14} />}
      </button>

      {showMenu &&
        tools.map((tool) => (
          <button
            key={tool.key}
            type="button"
            onClick={() => (tool.action ? tool.action() : insert(tool.before ?? "", tool.after))}
            className="st-btn w-9 h-9 rounded-lg flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink"
            aria-label={tool.label}
            title={tool.label}
          >
            <tool.icon size={14} />
          </button>
        ))}
    </div>
  );
}
