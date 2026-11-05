"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { playMechanicalClick } from "@/lib/audio";
import { showToast } from "@/lib/bus";
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
  type Theme,
} from "@/lib/theme";

/**
 * 主题拨杆：两档物理开关，日光在左、夜光在右。
 * 与声效开关共用一套“凹槽 + 滑块”的拟物语法，但独立成型，避免两个开关混淆。
 */

const OPTIONS: ReadonlyArray<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "浅色主题", Icon: Sun },
  { value: "dark", label: "深色主题", Icon: Moon },
];

export default function ThemeToggle({
  variant = "rocker",
  className = "",
}: {
  variant?: "rocker" | "compact";
  className?: string;
}) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  const choose = (next: Theme) => {
    if (next === theme) return;
    playMechanicalClick(next === "light" ? 980 : 720, 0.04);
    setTheme(next);
    showToast(next === "light" ? "已切换到浅色主题" : "已切换到深色主题");
  };

  if (variant === "compact") {
    const isLight = theme === "light";
    return (
      <button
        type="button"
        onClick={() => choose(isLight ? "dark" : "light")}
        aria-label={isLight ? "切换到深色主题" : "切换到浅色主题"}
        title={isLight ? "切换到深色主题" : "切换到浅色主题"}
        className={`tap-44 relative st-btn st-btn-icon-md flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink ${className}`}
      >
        {isLight ? (
          <Sun size={14} className="text-smartisan-gold" />
        ) : (
          <Moon size={14} className="text-smartisan-gold" />
        )}
      </button>
    );
  }

  return (
    <div
      className={`theme-rocker ${className}`}
      role="group"
      aria-label="主题外观"
      title={`当前：${theme === "light" ? "浅色" : "深色"}主题`}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => choose(value)}
          aria-pressed={theme === value}
          aria-label={label}
          title={label}
          className="theme-rocker-option tap-44-y relative"
        >
          <Icon size={12} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
