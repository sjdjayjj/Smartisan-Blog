"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 古典翻页钟计数器：
 * 数字进入视野后从 0 逐位翻到目标值，每位上下半页分别向下 / 向上翻转。
 * 只在数字变化时触发动画，视觉上保持克制，符合站点拟物基调。
 */

function FlipDigit({
  value,
  delay,
  active,
}: {
  value: string;
  delay: number;
  active: boolean;
}) {
  const currentRef = useRef("0");
  const [prev, setPrev] = useState("0");
  const [current, setCurrent] = useState("0");
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (!active) return;
    const start = window.setTimeout(() => {
      const previous = currentRef.current;
      currentRef.current = value;
      setPrev(previous);
      setCurrent(value);
      setFlipping(true);
    }, delay);
    return () => window.clearTimeout(start);
  }, [active, value, delay]);

  useEffect(() => {
    if (!flipping) return;
    const timer = window.setTimeout(() => setFlipping(false), 660);
    return () => window.clearTimeout(timer);
  }, [flipping]);

  return (
    <span className="flip-digit" aria-hidden="true">
      <span className="flip-half flip-top">
        <span>{current}</span>
      </span>
      <span className="flip-half flip-bottom">
        <span>{flipping ? prev : current}</span>
      </span>
      <span className={`flip-flap flip-flap-top ${flipping ? "is-flipping" : ""}`}>
        <span>{prev}</span>
      </span>
      <span className={`flip-flap flip-flap-bottom ${flipping ? "is-flipping" : ""}`}>
        <span>{current}</span>
      </span>
    </span>
  );
}

export default function FlipCounter({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // 不支持 IntersectionObserver 的环境直接进入已激活状态
  const [active, setActive] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  let digitIndex = 0;

  return (
    <span
      ref={ref}
      className={`flip-counter ${className}`.trim()}
      role="img"
      aria-label={value}
    >
      {Array.from(value).map((char, index) => {
        if (/\d/.test(char)) {
          const delay = 90 * digitIndex;
          digitIndex += 1;
          return (
            <FlipDigit
              key={`${index}-${char}`}
              value={char}
              delay={delay}
              active={active}
            />
          );
        }
        return (
          <span key={`${index}-${char}`} className="flip-sep" aria-hidden="true">
            {char}
          </span>
        );
      })}
    </span>
  );
}
