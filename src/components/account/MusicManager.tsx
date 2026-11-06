"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Disc3,
  Loader2,
  Pause,
  PencilLine,
  Play,
  Plus,
  Save,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { showToast } from "@/lib/bus";
import type { MusicTrack } from "@/lib/music";

/**
 * 工坊歌单编辑器：整体编辑后再整份提交。
 * 这里不 import `@/lib/music` 的运行时代码，避免把 KV 客户端拖进浏览器包。
 */

// 与 music.ts 的 MUSIC_LIMITS 保持一致（仅前端提前拦截，真正校验在服务端）
const LIMITS = { tracks: 30, title: 80, artist: 60, src: 500, duration: 16 };
const DURATION_RE = /^\d{1,3}:[0-5]\d$/;
const UPLOAD_LIMIT_MB = 60;
const META_TIMEOUT_MS = 8_000;

const INPUT =
  "w-full bg-smartisan-sunken border border-smartisan-line rounded-lg px-3 py-2.5 text-xs font-mono text-smartisan-text placeholder:text-smartisan-faint outline-none focus:border-smartisan-red/50 transition";

interface DraftTrack extends MusicTrack {
  key: string;
}

interface FormState {
  index: number | null;
  title: string;
  artist: string;
  src: string;
  duration: string;
}

let keySeq = 0;
function nextKey() {
  keySeq += 1;
  return `track-${keySeq}`;
}

function toDrafts(tracks: MusicTrack[]): DraftTrack[] {
  return tracks.map((track) => ({ ...track, key: nextKey() }));
}

function formatDuration(seconds: number) {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** 用一次不可见的 <audio> 读时长；读不到（跨域 / 格式不支持 / 超时）返回 null。 */
function readDuration(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const audio = new Audio();
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), META_TIMEOUT_MS);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const value = audio.duration;
      finish(Number.isFinite(value) && value > 0 ? formatDuration(value) : null);
    };
    audio.onerror = () => finish(null);
    audio.src = src;
  });
}

export default function MusicManager({
  initialTracks,
  kvReady,
  r2Ready,
}: {
  initialTracks: MusicTrack[];
  kvReady: boolean;
  r2Ready: boolean;
}) {
  const [tracks, setTracks] = useState<DraftTrack[]>(() => toDrafts(initialTracks));
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewSrc, setPreviewSrc] = useState("");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 卸载时停掉试听，避免离开页面后还有声音
  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  const openNew = () => {
    setError("");
    setForm({ index: null, title: "", artist: "", src: "", duration: "" });
  };

  const openEdit = (index: number) => {
    const track = tracks[index];
    if (!track) return;
    setError("");
    setForm({
      index,
      title: track.title,
      artist: track.artist ?? "",
      src: track.src,
      duration: track.duration ?? "",
    });
  };

  const applyForm = () => {
    if (!form) return;
    const title = form.title.trim();
    const artist = form.artist.trim();
    const src = form.src.trim();
    const duration = form.duration.trim();

    if (!title) {
      setError("请填写标题");
      return;
    }
    if (title.length > LIMITS.title) {
      setError(`标题最多 ${LIMITS.title} 个字符`);
      return;
    }
    if (artist.length > LIMITS.artist) {
      setError(`艺术家名最多 ${LIMITS.artist} 个字符`);
      return;
    }
    if (!src) {
      setError("请填写音频地址，或先上传音频");
      return;
    }
    if (src.length > LIMITS.src) {
      setError(`地址最多 ${LIMITS.src} 个字符`);
      return;
    }
    let url: URL;
    try {
      url = new URL(src);
    } catch {
      setError("音频地址不是合法 URL");
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      setError("音频地址必须是 http(s)");
      return;
    }
    if (duration && !DURATION_RE.test(duration)) {
      setError("时长需写成 mm:ss，例如 03:24");
      return;
    }
    if (form.index === null && tracks.length >= LIMITS.tracks) {
      setError(`曲目数量上限为 ${LIMITS.tracks} 首`);
      return;
    }

    const next: MusicTrack = {
      title,
      ...(artist ? { artist } : {}),
      src,
      ...(duration ? { duration } : {}),
    };

    if (form.index === null) {
      setTracks((prev) => [...prev, { ...next, key: nextKey() }]);
      showToast("已加入歌单，记得点击保存");
    } else {
      const index = form.index;
      setTracks((prev) =>
        prev.map((track, i) =>
          i === index ? { ...next, key: track.key } : track
        )
      );
      showToast("条目已更新，记得点击保存");
    }

    setError("");
    setForm(null);
  };

  const move = (index: number, delta: number) => {
    setTracks((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const remove = (index: number) => {
    setTracks((prev) => prev.filter((_, i) => i !== index));
    setForm((prev) => (prev?.index === index ? null : prev));
    showToast("已从列表移除，记得点击保存");
  };

  const preview = (src: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (previewSrc === src && !audio.paused) {
      audio.pause();
      return;
    }
    audio.pause();
    audio.src = src;
    setPreviewSrc(src);
    audio.play().catch(() => {
      setPlaying(false);
      setError("无法播放该音频，请检查地址是否可公开访问");
    });
  };

  const upload = async (file: File) => {
    if (!r2Ready) {
      showToast("R2 未配置，暂时只能手填外部地址");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        const message = data.error ?? "上传失败";
        setError(message);
        showToast(message);
        return;
      }

      const url = data.url;
      const duration = await readDuration(url);
      const fallbackTitle = file.name.replace(/\.[^.]+$/, "");
      setForm((prev) =>
        prev
          ? {
              ...prev,
              src: url,
              title: prev.title || fallbackTitle.slice(0, LIMITS.title),
              duration: prev.duration || duration || "",
            }
          : {
              index: null,
              title: fallbackTitle.slice(0, LIMITS.title),
              artist: "",
              src: url,
              duration: duration ?? "",
            }
      );
      showToast("音频已上传，地址已回填");
    } catch {
      setError("上传失败，请检查网络或 R2 配置");
      showToast("上传失败，请检查网络或 R2 配置");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (saving || !kvReady) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/music", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracks: tracks.map((track) => ({
            title: track.title,
            ...(track.artist ? { artist: track.artist } : {}),
            src: track.src,
            ...(track.duration ? { duration: track.duration } : {}),
          })),
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        tracks?: MusicTrack[];
      };
      if (!response.ok) {
        const message = data.error ?? "保存失败";
        setError(message);
        showToast(message);
        return;
      }
      if (data.tracks) setTracks(toDrafts(data.tracks));
      showToast("歌单已保存，刷新首页即可听到");
    } catch {
      setError("保存失败，请检查网络后重试");
      showToast("保存失败，请检查网络后重试");
    } finally {
      setSaving(false);
    }
  };

  const dirtyHint = `${tracks.length} / ${LIMITS.tracks} TRACKS`;

  return (
    <section className="space-y-4">
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-smartisan-hairline pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-smartisan-gold shadow-gold-glow" />
          <h2 className="font-serif text-lg sm:text-xl font-bold text-smartisan-ink tracking-wider">
            歌单条目
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-smartisan-muted tracking-widest">
            {dirtyHint}
          </span>
          <button
            type="button"
            onClick={openNew}
            className="st-btn st-btn-md font-sans text-smartisan-ink flex items-center gap-1.5"
          >
            <Plus size={13} className="text-smartisan-gold" />
            新增曲目
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !kvReady}
            className="st-btn st-btn-lg font-sans text-smartisan-ink flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} className="text-smartisan-red" />}
            {saving ? "保存中…" : "保存歌单"}
          </button>
        </div>
      </div>

      {!kvReady ? (
        <p className="st-well rounded-xl px-4 py-3 text-[11px] font-sans text-smartisan-muted">
          KV 未配置（<span className="font-mono">CF_KV_NAMESPACE_ID</span> /
          <span className="font-mono"> CF_API_TOKEN</span>），保存会失败；当前展示的是
          <span className="font-mono"> music.ts</span> 的静态默认值。
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs font-sans text-smartisan-red">
          {error}
        </p>
      ) : null}

      {tracks.length === 0 ? (
        <div className="st-well rounded-xl p-10 text-center space-y-2">
          <p className="text-sm text-smartisan-muted font-sans">暂无曲目。</p>
          <p className="text-[11px] text-smartisan-faint font-sans">
            点「新增曲目」手填地址，或在编辑框里直接上传音频（≤ {UPLOAD_LIMIT_MB}MB）。
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tracks.map((track, index) => {
            const isPlayingThis = playing && previewSrc === track.src;
            return (
              <div
                key={track.key}
                className="st-card rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-8 h-8 shrink-0 rounded-lg st-well flex items-center justify-center font-mono text-[11px] text-smartisan-gold">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-serif text-sm font-bold text-smartisan-ink truncate">
                        {track.title}
                      </h3>
                      {track.duration ? (
                        <span className="font-mono text-[10px] text-smartisan-muted tabular-nums">
                          {track.duration}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-mono text-[10px] text-smartisan-muted truncate">
                      {track.artist ?? "UNKNOWN ARTIST"}
                    </p>
                    <p className="font-mono text-[10px] text-smartisan-faint truncate">
                      {track.src}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => preview(track.src)}
                    aria-label={isPlayingThis ? "暂停试听" : "试听"}
                    className="st-btn st-btn-icon-sm text-smartisan-gold"
                  >
                    {isPlayingThis ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="上移"
                    className="st-btn st-btn-icon-sm text-smartisan-muted hover:text-smartisan-ink disabled:opacity-40"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === tracks.length - 1}
                    aria-label="下移"
                    className="st-btn st-btn-icon-sm text-smartisan-muted hover:text-smartisan-ink disabled:opacity-40"
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(index)}
                    className="st-btn st-btn-md font-sans text-smartisan-ink flex items-center gap-1.5"
                  >
                    <PencilLine size={12} className="text-smartisan-gold" />
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label="删除"
                    className="st-btn st-btn-icon-sm text-smartisan-muted hover:text-smartisan-red"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form ? (
        <div className="st-card rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Disc3 size={14} className="text-smartisan-gold" />
              <h3 className="font-serif text-base font-bold text-smartisan-ink">
                {form.index === null ? "新增曲目" : `编辑第 ${form.index + 1} 首`}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setForm(null)}
              aria-label="关闭编辑"
              className="st-btn st-btn-icon-sm text-smartisan-muted hover:text-smartisan-ink"
            >
              <X size={12} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                标题（必填）
              </span>
              <input
                className={`${INPUT} mt-1.5`}
                value={form.title}
                maxLength={LIMITS.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="夜航西飞"
              />
            </label>

            <label className="block">
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                艺术家（可选）
              </span>
              <input
                className={`${INPUT} mt-1.5`}
                value={form.artist}
                maxLength={LIMITS.artist}
                onChange={(event) => setForm({ ...form, artist: event.target.value })}
                placeholder="工匠电台"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                音频地址（http/https）
              </span>
              <input
                className={`${INPUT} mt-1.5`}
                value={form.src}
                maxLength={LIMITS.src}
                onChange={(event) => setForm({ ...form, src: event.target.value })}
                placeholder="https://media.example.com/music/track.mp3"
              />
            </label>

            <label className="block">
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                时长（可选，mm:ss）
              </span>
              <input
                className={`${INPUT} mt-1.5`}
                value={form.duration}
                maxLength={LIMITS.duration}
                onChange={(event) => setForm({ ...form, duration: event.target.value })}
                placeholder="03:24"
              />
            </label>

            <div className="block">
              <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                上传到 R2
              </span>
              <div className="mt-1.5 st-well rounded-xl p-3">
                <input
                  type="file"
                  accept="audio/*"
                  disabled={!r2Ready || uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = "";
                  }}
                  className="w-full text-[11px] text-smartisan-muted file:mr-3 file:rounded-lg file:border-0 file:bg-smartisan-card file:px-3 file:py-1.5 file:text-[11px] file:text-smartisan-text disabled:opacity-40"
                />
                {uploading ? (
                  <div className="mt-2 flex items-center justify-center gap-2 font-mono text-[10px] text-smartisan-gold">
                    <Loader2 size={12} className="animate-spin" />
                    正在上传…
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-center gap-1.5 font-mono text-[10px] text-smartisan-muted">
                    <UploadCloud size={12} />
                    {r2Ready ? `音频 ≤ ${UPLOAD_LIMIT_MB}MB，上传后自动回填` : "R2 未配置，只能手填地址"}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setForm(null)}
              className="st-btn st-btn-md font-sans text-smartisan-muted hover:text-smartisan-ink"
            >
              取消
            </button>
            <button
              type="button"
              onClick={applyForm}
              className="st-btn st-btn-md font-sans text-smartisan-ink flex items-center gap-1.5"
            >
              <Check size={12} className="text-smartisan-gold" />
              {form.index === null ? "加入歌单" : "保存修改"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
