import { NextResponse } from "next/server";
import { getWeather, normalizeCoordinate } from "@/lib/weather";

/**
 * 浏览器定位后把坐标交给这里取数：
 * 坐标不写日志、不落盘，只作为缓存键（已降到两位小数）。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLatitude = searchParams.get("lat");
  const rawLongitude = searchParams.get("lon");

  const latitude = rawLatitude === null ? NaN : Number(rawLatitude);
  const longitude = rawLongitude === null ? NaN : Number(rawLongitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return NextResponse.json({ error: "坐标无效" }, { status: 400 });
  }

  const weather = await getWeather(
    normalizeCoordinate(latitude),
    normalizeCoordinate(longitude)
  );

  if (!weather) {
    return NextResponse.json({ error: "天气暂不可用" }, { status: 502 });
  }

  return NextResponse.json(
    { weather },
    {
      headers: {
        // 与 getWeather 的 15 分钟缓存对齐，CDN 命中时连函数缓存都不用进
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    }
  );
}
