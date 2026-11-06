import { cacheLife } from "next/cache";
import { gadgetCity } from "@/lib/site";

export interface WeatherSnapshot {
  temperature: number;
  apparent: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  isDay: boolean;
  high: number;
  low: number;
}

export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Open-Meteo 冷启动（DNS + TLS）实测可以到 7 秒级；
 * 8 秒上限既兜住挂死的连接，也不会把一次正常的慢请求误判成失败。
 * 失败只影响这一张卡，不阻塞页面其余部分。
 */
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * 坐标保留两位小数（约 1.1km 网格）。
 * 天气本身是网格数据，降精度不会影响结果；同时避免精确到米的坐标成为缓存键。
 */
export function normalizeCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

function readEnvCoordinate(raw: string | undefined) {
  const value = raw?.trim();
  if (!value) return NaN;
  return Number(value);
}

/** 定位失败时的兜底城市；名称与坐标可用 WEATHER_* 覆盖（只在服务端读取）。 */
export function fallbackLocation(): WeatherLocation {
  const latitude = readEnvCoordinate(process.env.WEATHER_LATITUDE);
  const longitude = readEnvCoordinate(process.env.WEATHER_LONGITUDE);
  return {
    name: process.env.WEATHER_CITY?.trim() || gadgetCity.name,
    latitude: Number.isFinite(latitude) ? latitude : gadgetCity.latitude,
    longitude: Number.isFinite(longitude) ? longitude : gadgetCity.longitude,
  };
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    is_day?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

/**
 * 按坐标取数并缓存 15 分钟。天气是按网格发布的，同一网格内的请求共享缓存。
 * 任何异常都返回 null，由卡片降级展示，绝不让首页因为第三方接口不可用而渲染失败。
 */
export async function getWeather(
  latitude: number,
  longitude: number
): Promise<WeatherSnapshot | null> {
  "use cache";
  cacheLife({ revalidate: 900 });

  const params = new URLSearchParams({
    latitude: latitude.toFixed(2),
    longitude: longitude.toFixed(2),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    daily: "temperature_2m_max,temperature_2m_min",
    // 坐标可能不在中国时区，按坐标自动推断，日高低温才落在当地的一天里
    timezone: "auto",
    forecast_days: "1",
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as OpenMeteoResponse;
    const current = payload.current;
    const daily = payload.daily;
    const high = daily?.temperature_2m_max?.[0];
    const low = daily?.temperature_2m_min?.[0];

    if (
      typeof current?.temperature_2m !== "number" ||
      typeof current.apparent_temperature !== "number" ||
      typeof current.relative_humidity_2m !== "number" ||
      typeof current.weather_code !== "number" ||
      typeof current.wind_speed_10m !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number"
    ) {
      return null;
    }

    return {
      temperature: current.temperature_2m,
      apparent: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      weatherCode: current.weather_code,
      isDay: current.is_day !== 0,
      high,
      low,
    };
  } catch {
    return null;
  }
}
