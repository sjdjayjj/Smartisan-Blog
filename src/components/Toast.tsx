"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { TOAST_EVENT } from "@/lib/bus";

export default function Toast() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setMessage(detail);
      setVisible(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(false), 2400);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className={`fixed safe-toast z-[60] max-w-[calc(100vw-2rem)] bg-smartisan-surface border border-smartisan-gold/40 text-smartisan-ink px-4 py-3 rounded-xl shadow-2xl font-mono text-xs flex items-center gap-2 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0 pointer-events-none"
      }`}
    >
      <CircleCheck size={14} className="text-smartisan-gold shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}
