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

/** 城市名只用于展示，可用 WEATHER_CITY 覆盖；坐标决定实际取数位置。 */
export function weatherCityName() {
  return process.env.WEATHER_CITY?.trim() || gadgetCity.name;
}

function readConfig() {
  const latitude = Number(process.env.WEATHER_LATITUDE);
  const longitude = Number(process.env.WEATHER_LONGITUDE);
  return {
    latitude: Number.isFinite(latitude) ? latitude : gadgetCity.latitude,
    longitude: Number.isFinite(longitude) ? longitude : gadgetCity.longitude,
  };
}

/**
 * 服务端取数并缓存 15 分钟。任何异常都返回 null，由卡片降级展示，
 * 绝不让首页因为第三方天气接口不可用而渲染失败。
 */
export async function getWeather(): Promise<WeatherSnapshot | null> {
  "use cache";
  cacheLife({ revalidate: 900 });

  const { latitude, longitude } = readConfig();
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: gadgetCity.timeZone,
    forecast_days: "1",
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(4000),
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
