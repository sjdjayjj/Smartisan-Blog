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
import { getWeather, weatherCityName, type WeatherSnapshot } from "@/lib/weather";

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

export default function WeatherPanel({
  weather,
  pending = false,
}: {
  weather: WeatherSnapshot | null;
  /** 正在取数（Suspense 兜底），与真正失败区分开 */
  pending?: boolean;
}) {
  const meta = weather ? weatherMeta(weather.weatherCode, weather.isDay) : null;
  const Icon = meta ? meta.icon : pending ? Cloud : CloudOff;
  const label = meta ? meta.label : pending ? "读取中…" : "天气暂不可用";

  return (
    <GadgetPanel
      title="天气"
      meta="OPEN-METEO"
      footer={
        <>
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-smartisan-faint hover:text-smartisan-muted transition-colors truncate"
          >
            天气数据 · Open-Meteo (CC BY 4.0)
          </a>
          <span className="font-mono text-[10px] text-smartisan-muted tracking-widest whitespace-nowrap">
            {pending ? "SYNCING" : weather ? "LIVE" : "OFFLINE"}
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
              ? `${weatherCityName()} · H ${Math.round(weather.high)}° / L ${Math.round(weather.low)}°`
              : `${weatherCityName()} · H —° / L —°`}
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

/** 取数失败时 getWeather 返回 null，卡片降级为离线态，不影响整页渲染。 */
export async function WeatherPanelAsync() {
  const weather = await getWeather();
  return <WeatherPanel weather={weather} />;
}
