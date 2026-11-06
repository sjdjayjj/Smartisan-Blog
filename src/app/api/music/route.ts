import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { KvError, isKvConfigured } from "@/lib/kv";
import {
  MUSIC_CACHE_TAG,
  defaultMusicTracks,
  loadMusicTracks,
  saveMusicTracks,
  validateMusicTracks,
} from "@/lib/music";

/**
 * 工坊歌单接口：整份读取 / 整份覆盖。
 * 鉴权在每个 method 的第一行，未登录或非白名单一律 401。
 */

function storageError(error: unknown) {
  if (error instanceof KvError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.code === "store_not_ready" ? 503 : 502 }
    );
  }
  console.error("[api/music]", error);
  return NextResponse.json({ error: "歌单存储暂时不可用" }, { status: 500 });
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const ready = isKvConfigured();
    const tracks = ready ? await loadMusicTracks() : defaultMusicTracks;
    return NextResponse.json({ ready, tracks });
  } catch (error) {
    return storageError(error);
  }
}

export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  if (!isKvConfigured()) {
    return NextResponse.json(
      { error: "KV 未配置，请先设置 CF_KV_NAMESPACE_ID 与 CF_API_TOKEN", code: "store_not_ready" },
      { status: 503 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误", code: "invalid_body" }, { status: 400 });
  }

  const tracksInput = (payload as { tracks?: unknown } | null)?.tracks;
  const result = validateMusicTracks(tracksInput);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: 400 });
  }

  try {
    await saveMusicTracks(result.tracks);
    // 首页的 'use cache' 结果带 tag "music"；这里让下一次请求立刻重读 KV
    revalidateTag(MUSIC_CACHE_TAG, "max");
    revalidatePath("/");
    return NextResponse.json({ ok: true, tracks: result.tracks });
  } catch (error) {
    return storageError(error);
  }
}
