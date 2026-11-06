"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudOff,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Moon,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";
import GadgetPanel from "./GadgetPanel";
import type { WeatherLocation, WeatherSnapshot } from "@/lib/weather";

/** 与 weather.ts 的 normalizeCoordinate 保持一致；这里不 import，避免把服务端模块拖进客户端包。 */
function roundToGrid(value: number) {
  return Math.round(value * 100) / 100;
}

/** 定位等待上限：用户拒绝或系统超时都落到兜底城市，卡片不会一直停在读取中。 */
const GEOLOCATION_TIMEOUT_MS = 8_000;
const GEOLOCATION_MAX_AGE_MS = 5 * 60 * 1000;
const REVERSE_TIMEOUT_MS = 5_000;

type Phase = "pending" | "ready" | "offline";

/** WMO 天气码 → 中文描述与图标；未识别的码按阴天兜底。 */
function weatherMeta(code: number, isDay: boolean): { label: string; icon: LucideIcon } {
  if (code === 0) return isDay ? { label: "晴", icon: Sun } : { label: "晴夜", icon: Moon };
  if (code === 1)
    return isDay ? { label: "大部晴朗", icon: Sun } : { label: "星夜", icon: Moon };
  if (code === 2)
    return isDay ? { label: "局部多云", icon: CloudSun } : { label: "云夜", icon: CloudMoon };
  if (code === 3) return { label: "阴", icon: Cloud };
  if (code === 45 || code === 48) return { label: "有雾", icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: "毛毛雨", icon: CloudDrizzle };
  if (code >= 61 && code <= 67) return { label: "降雨", icon: CloudRain };
  if (code >= 71 && code <= 77) return { label: "降雪", icon: CloudSnow };
  if (code >= 80 && code <= 82) return { label: "阵雨", icon: CloudRain };
  if (code >= 85 && code <= 86) return { label: "阵雪", icon: CloudSnow };
  if (code >= 95) return { label: "雷雨", icon: CloudLightning };
  return { label: "多云", icon: Cloud };
}

interface ReverseGeocodeResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
}

/**
 * 经纬度反查城市名。Open-Meteo 的 Geocoding 只能按地名搜索、不支持反向查询，
 * 因此这里用 BigDataCloud 的免费客户端反查接口：无 Key、必须在浏览器里带设备坐标调用。
 */
async function resolveCityName(latitude: number, longitude: number) {
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: "zh",
    });
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`,
      { signal: AbortSignal.timeout(REVERSE_TIMEOUT_MS) }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as ReverseGeocodeResponse;
    return (
      payload.city?.trim() ||
      payload.locality?.trim() ||
      payload.principalSubdivision?.trim() ||
      payload.countryName?.trim() ||
      null
    );
  } catch {
    return null;
  }
}

export default function WeatherPanel({ fallback }: { fallback: WeatherLocation }) {
  const [phase, setPhase] = useState<Phase>("pending");
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [city, setCity] = useState(fallback.name);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async (latitude: number, longitude: number, presetCity?: string) => {
      try {
        const response = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("weather unavailable");
        const payload = (await response.json()) as { weather?: WeatherSnapshot };
        if (!payload.weather) throw new Error("weather unavailable");
        if (cancelled) return;
        setWeather(payload.weather);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("offline");
      }

      const name = presetCity ?? (await resolveCityName(latitude, longitude));
      if (!cancelled) setCity(name ?? "当前位置");
    };

    if (!("geolocation" in navigator)) {
      void load(fallback.latitude, fallback.longitude, fallback.name);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        void load(
          roundToGrid(position.coords.latitude),
          roundToGrid(position.coords.longitude)
        );
      },
      () => {
        // 拒绝授权、超时、定位不可用：一律回到兜底城市
        if (!cancelled) void load(fallback.latitude, fallback.longitude, fallback.name);
      },
      {
        enableHighAccuracy: false,
        timeout: GEOLOCATION_TIMEOUT_MS,
        // 只复用浏览器内存里 5 分钟内的定位结果，不落盘
        maximumAge: GEOLOCATION_MAX_AGE_MS,
      }
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fallback.latitude, fallback.longitude, fallback.name]);

  const meta = weather ? weatherMeta(weather.weatherCode, weather.isDay) : null;
  const Icon = meta ? meta.icon : phase === "pending" ? Cloud : CloudOff;
  const label = meta ? meta.label : phase === "pending" ? "读取中…" : "天气暂不可用";

  return (
    <GadgetPanel
      title="天气"
      meta="OPEN-METEO"
      footer={
        <>
          <div className="min-w-0 flex items-center gap-1 truncate font-mono text-[10px] text-smartisan-faint">
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-smartisan-muted transition-colors whitespace-nowrap"
            >
              天气 · Open-Meteo (CC BY 4.0)
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="https://www.bigdatacloud.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-smartisan-muted transition-colors whitespace-nowrap"
            >
              城市 · BigDataCloud
            </a>
          </div>
          <span className="font-mono text-[10px] text-smartisan-muted tracking-widest whitespace-nowrap">
            {phase === "pending" ? "SYNCING" : weather ? "LIVE" : "OFFLINE"}
          </span>
        </>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-0.5">
            <span className="font-mono text-[32px] leading-none text-smartisan-ink tabular-nums">
              {weather ? Math.round(weather.temperature) : "—"}
            </span>
            <span className="font-mono text-base text-smartisan-muted">°</span>
          </div>
          <p className="mt-2 font-sans text-xs text-smartisan-text truncate">{label}</p>
          <p className="mt-1 font-mono text-[10px] text-smartisan-muted tracking-wider truncate">
            {weather
              ? `${city} · H ${Math.round(weather.high)}° / L ${Math.round(weather.low)}°`
              : `${city} · H —° / L —°`}
          </p>
        </div>

        <Icon
          size={28}
          className={`shrink-0 ${meta ? "text-smartisan-gold" : "text-smartisan-faint"}`}
        />
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 pt-3">
        <span className="flex items-center gap-1 font-mono text-[10px] text-smartisan-muted tabular-nums">
          <Thermometer size={11} className="shrink-0 text-smartisan-faint" />
          {weather ? `${Math.round(weather.apparent)}°` : "—"}
        </span>
        <span className="flex items-center gap-1 font-mono text-[10px] text-smartisan-muted tabular-nums">
          <Droplets size={11} className="shrink-0 text-smartisan-faint" />
          {weather ? `${Math.round(weather.humidity)}%` : "—"}
        </span>
        <span className="flex items-center gap-1 font-mono text-[10px] text-smartisan-muted tabular-nums">
          <Wind size={11} className="shrink-0 text-smartisan-faint" />
          {weather ? `${Math.round(weather.windSpeed)}km/h` : "—"}
        </span>
      </div>
    </GadgetPanel>
  );
}
