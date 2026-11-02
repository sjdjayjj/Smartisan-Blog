"use client";

import { useEffect, useRef } from "react";

/**
 * 顶部细红线阅读进度：整页滚动时从左向右点亮，滚动到底恰好铺满。
 * 直接用 transform 驱动，不触发 React 重渲染。
 */
export default function ReadingProgress() {
  const fillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      const clamped = Math.min(1, Math.max(0, progress));
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${clamped.toFixed(4)})`;
      }
    };

    const request = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    return () => {
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-[2px] pointer-events-none bg-smartisan-veil"
      aria-hidden="true"
    >
      <div ref={fillRef} className="reading-progress-fill h-full w-full" />
    </div>
  );
}
