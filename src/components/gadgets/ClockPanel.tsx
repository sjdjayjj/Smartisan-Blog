"use client";

import { useEffect, useRef, useState } from "react";
import GadgetPanel from "./GadgetPanel";
import { gadgetCity } from "@/lib/site";

const TIME_ZONE = gadgetCity.timeZone;

const zoneFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const weekdayFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TIME_ZONE,
  weekday: "long",
});

/** 表盘刻度用三角函数定位，纯常量计算，服务端与客户端结果一致。 */
const DIAL_TICKS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index * Math.PI) / 6;
  return {
    index,
    left: 50 + Math.sin(angle) * 38,
    top: 50 - Math.cos(angle) * 38,
    major: index % 3 === 0,
  };
});

function zonedParts(date: Date) {
  const parts = zoneFormat.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    weekday: weekdayFormat.format(date),
  };
}

export default function ClockPanel() {
  /** SSR 阶段不渲染真实时间：先输出 --:-- 占位，挂载后再写值，避免水合不一致。 */
  const [now, setNow] = useState<Date | null>(null);
  const [secondAngle, setSecondAngle] = useState(0);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const current = new Date();
      const stamp = current.getTime();
      const previous = lastTickRef.current;
      // 角度只累加、不取模：跨过 360° 时继续正向增长，避免指针在整分处反向回甩一圈
      setSecondAngle((angle) =>
        previous === null
          ? (current.getSeconds() + current.getMilliseconds() / 1000) * 6
          : angle + ((stamp - previous) / 1000) * 6
      );
      lastTickRef.current = stamp;
      setNow(current);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const parts = now ? zonedParts(now) : null;
  const hour = parts ? Number(parts.hour) : 0;
  const minute = parts ? Number(parts.minute) : 0;
  const second = parts ? Number(parts.second) : 0;
  const hourAngle = (hour % 12) * 30 + minute * 0.5;
  const minuteAngle = minute * 6 + second * 0.1;

  return (
    <GadgetPanel
      title="时钟"
      meta="UTC+8"
      footer={
        <>
          <span className="font-mono text-[10px] text-smartisan-faint tracking-widest">
            ANALOG · DIGITAL
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-smartisan-muted">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                parts ? "bg-smartisan-gold" : "bg-smartisan-line-strong"
              }`}
            />
            {parts ? "SYNCED" : "SYNCING"}
          </span>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="relative w-24 h-24 shrink-0 rounded-full st-well"
        >
          {DIAL_TICKS.map((tick) => (
            <span
              key={tick.index}
              className={`absolute rounded-full ${
                tick.major ? "w-1 h-1 bg-smartisan-faint" : "w-0.5 h-0.5 bg-smartisan-line-strong"
              }`}
              style={{
                left: `${tick.left}%`,
                top: `${tick.top}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}

          {parts ? (
            <>
              <span
                className="absolute bottom-1/2 left-1/2 h-[24%] w-0.5 origin-bottom rounded-full bg-smartisan-ink transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-50%) rotate(${hourAngle}deg)` }}
              />
              <span
                className="absolute bottom-1/2 left-1/2 h-[32%] w-0.5 origin-bottom rounded-full bg-smartisan-text transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-50%) rotate(${minuteAngle}deg)` }}
              />
              <span
                className="absolute bottom-1/2 left-1/2 h-[38%] w-px origin-bottom rounded-full bg-smartisan-red transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-50%) rotate(${secondAngle}deg)` }}
              />
            </>
          ) : null}

          <span className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-smartisan-red shadow-red-glow" />
        </div>

        <div
          className="min-w-0 flex-1"
          role="timer"
          aria-label={
            parts
              ? `当前时间 ${parts.hour}:${parts.minute}，${parts.weekday}`
              : "当前时间读取中"
          }
        >
          <div className="font-mono text-[28px] leading-none text-smartisan-ink tabular-nums tracking-tight">
            {parts ? `${parts.hour}:${parts.minute}` : "--:--"}
          </div>
          <div className="mt-2 font-mono text-[10px] text-smartisan-muted tracking-widest">
            CST · ASIA/SHANGHAI
          </div>
          <div className="mt-2 font-sans text-[11px] text-smartisan-text truncate">
            {parts ? `${parts.year}.${parts.month}.${parts.day} ${parts.weekday}` : "正在同步…"}
          </div>
        </div>
      </div>
    </GadgetPanel>
  );
}
