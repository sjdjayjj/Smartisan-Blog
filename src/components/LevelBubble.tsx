"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * 水平仪回顶浮标：右下角的圆形水泡水平仪，
 * 水泡随页面滚动进度在玻璃管里漂移，点击平滑回到顶部。
 */
export default function LevelBubble() {
  const [visible, setVisible] = useState(false);
  const dropRef = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const update = () => {
      frameRef.current = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      setVisible(window.scrollY > 400);

      const drop = dropRef.current;
      if (drop) {
        // 水泡沿玻璃管上下浮动，模拟页面倾斜带来的气泡跑位
        const offset = (progress - 0.5) * 8;
        drop.style.transform = `translate(-50%, -50%) translateY(${offset.toFixed(1)}px)`;
      }
    };

    const onScroll = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const backToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={backToTop}
      aria-label="回到顶部"
      title="水平仪归零 · 回到顶部"
      className={`level-bubble ${visible ? "is-visible" : ""}`}
    >
      <span className="level-tube" aria-hidden="true">
        <span ref={dropRef} className="level-drop" />
      </span>
      <ArrowUp size={12} className="level-arrow" aria-hidden="true" />
    </button>
  );
}
