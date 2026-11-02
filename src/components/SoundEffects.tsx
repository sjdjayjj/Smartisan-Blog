"use client";

import { useEffect } from "react";
import { playMechanicalClick } from "@/lib/audio";

/** 为所有金属按键统一挂载机械点击声（事件委托，无需逐个绑定）。 */
export default function SoundEffects() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".st-btn, .category-btn")) {
        playMechanicalClick(650, 0.025);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
