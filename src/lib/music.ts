import { cacheLife, cacheTag } from "next/cache";
import { isKvConfigured, readKvValue, writeKvValue } from "@/lib/kv";

/**
 * 首页音乐模块的曲目清单：Cloudflare KV 优先，KV 未配置 / 无数据 / 读取失败
 * 时回落到代码里的静态默认值。
 *
 * 管理入口是工坊的 /account/music；服务端接口为 /api/music（PUT 整份提交）。
 * 音频仍自托管在 R2，src 填可公网访问的完整地址（`R2_PUBLIC_BASE_URL` + 对象键）。
 */

export interface MusicTrack {
  title: string;
  artist?: string;
  /** R2 公开地址（完整 URL） */
  src: string;
  /** 可选：元信息加载前的备用时长文案，如 "03:24" */
  duration?: string;
}

/** KV 键名：一条记录存整份歌单，避免逐曲增删键。 */
export const MUSIC_PLAYLIST_KEY = "music-playlist:v1";

/** 缓存标签：保存后由 /api/music 触发 revalidateTag("music")。 */
export const MUSIC_CACHE_TAG = "music";

/** KV 不可用或没有数据时的静态兜底（当前为空，面板显示空态）。 */
export const defaultMusicTracks: MusicTrack[] = [];

/** 服务端与前端表单共用的上限；前端只是提前拦住，真正校验在 validateMusicTracks。 */
export const MUSIC_LIMITS = {
  tracks: 30,
  title: 80,
  artist: 60,
  src: 500,
  duration: 16,
} as const;

export type MusicValidationCode =
  | "invalid_body"
  | "too_many_tracks"
  | "title_required"
  | "title_too_long"
  | "artist_too_long"
  | "src_invalid"
  | "src_too_long"
  | "duration_invalid";

export type MusicValidationResult =
  | { ok: true; tracks: MusicTrack[] }
  | { ok: false; code: MusicValidationCode; message: string };

const DURATION_RE = /^\d{1,3}:[0-5]\d$/;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 校验整份歌单；非法时返回明确 code，由 Route Handler 转成 400。 */
export function validateMusicTracks(input: unknown): MusicValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, code: "invalid_body", message: "tracks 必须是数组" };
  }
  if (input.length > MUSIC_LIMITS.tracks) {
    return {
      ok: false,
      code: "too_many_tracks",
      message: `曲目数量上限为 ${MUSIC_LIMITS.tracks} 首`,
    };
  }

  const tracks: MusicTrack[] = [];

  for (const [index, raw] of input.entries()) {
    const label = `第 ${index + 1} 首`;
    if (!raw || typeof raw !== "object") {
      return { ok: false, code: "invalid_body", message: `${label}格式不正确` };
    }
    const item = raw as Record<string, unknown>;

    const title = readText(item.title);
    if (!title) {
      return { ok: false, code: "title_required", message: `${label}缺少标题` };
    }
    if (title.length > MUSIC_LIMITS.title) {
      return {
        ok: false,
        code: "title_too_long",
        message: `${label}标题超过 ${MUSIC_LIMITS.title} 个字符`,
      };
    }

    const artist = readText(item.artist);
    if (artist.length > MUSIC_LIMITS.artist) {
      return {
        ok: false,
        code: "artist_too_long",
        message: `${label}艺术家名超过 ${MUSIC_LIMITS.artist} 个字符`,
      };
    }

    const src = readText(item.src);
    if (!src || src.length > MUSIC_LIMITS.src) {
      return {
        ok: false,
        code: src ? "src_too_long" : "src_invalid",
        message: src
          ? `${label}地址超过 ${MUSIC_LIMITS.src} 个字符`
          : `${label}缺少音频地址`,
      };
    }
    let url: URL;
    try {
      url = new URL(src);
    } catch {
      return { ok: false, code: "src_invalid", message: `${label}地址不是合法 URL` };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, code: "src_invalid", message: `${label}地址必须是 http(s)` };
    }
    if (url.username || url.password) {
      return {
        ok: false,
        code: "src_invalid",
        message: `${label}地址不能内嵌账号密码`,
      };
    }

    const duration = readText(item.duration);
    if (duration && !DURATION_RE.test(duration)) {
      return {
        ok: false,
        code: "duration_invalid",
        message: `${label}时长需写成 mm:ss`,
      };
    }

    tracks.push({
      title,
      ...(artist ? { artist } : {}),
      src,
      ...(duration ? { duration } : {}),
    });
  }

  return { ok: true, tracks };
}

/** 读取 KV 中的歌单原文；键不存在返回 null。 */
export async function readStoredMusicPlaylist(): Promise<string | null> {
  const raw = await readKvValue(MUSIC_PLAYLIST_KEY);
  return raw && raw.trim() ? raw : null;
}

/**
 * 首页读取入口：KV 优先，任何异常都回落到静态默认值，绝不让首页报错。
 *
 * 缓存策略：`'use cache'` + tag "music" + 60 秒兜底过期。
 * 保存时 /api/music 会 revalidateTag("music", "max")，下一次请求立刻重读 KV；
 * 即便标签失效没生效，最多 60 秒后也会自动过期。
 */
export async function loadMusicTracks(): Promise<MusicTrack[]> {
  "use cache";
  cacheLife({ revalidate: 60 });
  cacheTag(MUSIC_CACHE_TAG);

  if (!isKvConfigured()) return defaultMusicTracks;

  try {
    const raw = await readStoredMusicPlaylist();
    if (!raw) return defaultMusicTracks;
    const parsed = JSON.parse(raw) as { tracks?: unknown };
    const result = validateMusicTracks(parsed?.tracks);
    return result.ok ? result.tracks : defaultMusicTracks;
  } catch (error) {
    // KV 不可达或存了坏数据：留痕但不影响首屏
    console.warn("[music] 歌单读取失败，已回落到静态默认值", error);
    return defaultMusicTracks;
  }
}

/** 覆盖写入整份歌单（调用方已完成校验）。 */
export async function saveMusicTracks(tracks: MusicTrack[]): Promise<void> {
  await writeKvValue(
    MUSIC_PLAYLIST_KEY,
    JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      tracks,
    })
  );
}
