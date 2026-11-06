"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Disc3, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import GadgetPanel from "./GadgetPanel";
import type { MusicTrack } from "@/lib/music";

const VOLUME_KEY = "smartisan:music-volume";
const DEFAULT_VOLUME = 0.8;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iP(hone|ad|od)/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** 服务端一律 false、客户端挂载后为真实结果，避免水合时渲染出不同的控件。 */
function subscribeNoop() {
  return () => {};
}

function readStoredVolume() {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (!raw) return DEFAULT_VOLUME;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp01(parsed) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export default function MusicPanel({ tracks }: { tracks: MusicTrack[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(readStoredVolume);
  // iOS 上音量只能由系统控制，隐藏滑杆
  const canAdjustVolume = useSyncExternalStore(
    subscribeNoop,
    () => !isIOSDevice(),
    () => false
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(false);
  const autoplayNextRef = useRef(false);

  const track = tracks[index] ?? null;
  const total = tracks.length;

  useEffect(() => {
    if (audioRef.current && canAdjustVolume) audioRef.current.volume = volume;
  }, [volume, canAdjustVolume]);

  // 切歌：重新加载音源；只有在用户此前已点击播放时才继续播放
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    if (playingRef.current || autoplayNextRef.current) {
      autoplayNextRef.current = false;
      audio.play().catch(() => {
        playingRef.current = false;
        setPlaying(false);
      });
    }
  }, [index]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (audio.paused) {
      audio.play().catch(() => setPlaying(false));
      return;
    }
    audio.pause();
  };

  const stepTrack = (delta: number) => {
    if (total < 2) return;
    setIndex((current) => (current + delta + total) % total);
  };

  const handleEnded = () => {
    if (total < 2) {
      setPlaying(false);
      return;
    }
    autoplayNextRef.current = true;
    setIndex((current) => (current + 1) % total);
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const handleVolume = (value: number) => {
    const next = clamp01(value);
    setVolume(next);
    try {
      window.localStorage.setItem(VOLUME_KEY, String(next));
    } catch {
      // 写入失败只影响偏好持久化
    }
  };

  const shownDuration = duration > 0 ? formatTime(duration) : track?.duration ?? "--:--";

  return (
    <GadgetPanel
      title="音乐"
      meta="R2"
      footer={
        <>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => stepTrack(-1)}
              disabled={total < 2}
              aria-label="上一曲"
              className="st-btn st-btn-icon-sm text-smartisan-muted hover:text-smartisan-ink"
            >
              <SkipBack size={12} />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={!track}
              aria-label={playing ? "暂停" : "播放"}
              className="st-btn st-btn-icon-md text-smartisan-ink"
            >
              {playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              type="button"
              onClick={() => stepTrack(1)}
              disabled={total < 2}
              aria-label="下一曲"
              className="st-btn st-btn-icon-sm text-smartisan-muted hover:text-smartisan-ink"
            >
              <SkipForward size={12} />
            </button>
          </div>

          {canAdjustVolume && track ? (
            <div className="flex items-center gap-1.5">
              <Volume2 size={12} className="text-smartisan-muted shrink-0" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={volume}
                onChange={(event) => handleVolume(Number(event.target.value))}
                aria-label="音量"
                className="st-range w-16"
              />
            </div>
          ) : (
            <span className="font-mono text-[10px] text-smartisan-faint tracking-widest">
              SELF-HOSTED
            </span>
          )}
        </>
      }
    >
      <audio
        ref={audioRef}
        src={track ? track.src : undefined}
        preload="metadata"
        onPlay={() => {
          playingRef.current = true;
          setPlaying(true);
        }}
        onPause={() => {
          playingRef.current = false;
          setPlaying(false);
        }}
        onEnded={handleEnded}
        onLoadStart={() => {
          setCurrentTime(0);
          setDuration(0);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        className="hidden"
      />

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 shrink-0 rounded-lg st-well flex items-center justify-center">
          <Disc3
            size={18}
            className={playing ? "text-smartisan-gold animate-spin motion-reduce:animate-none" : "text-smartisan-gold"}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-serif text-sm font-bold text-smartisan-ink truncate">
            {track?.title ?? "暂无曲目"}
          </p>
          <p className="mt-1 font-mono text-[10px] text-smartisan-muted tracking-widest truncate">
            {track ? track.artist ?? "UNKNOWN ARTIST" : "AWAITING TRACKS"}
          </p>
          <p className="mt-1 font-mono text-[10px] text-smartisan-faint tabular-nums">
            {track ? `${formatTime(currentTime)} / ${shownDuration}` : "--:-- / --:--"}
          </p>
        </div>

        <span className="shrink-0 font-mono text-[10px] text-smartisan-muted tabular-nums">
          {String(track ? index + 1 : 0).padStart(2, "0")}/{String(total).padStart(2, "0")}
        </span>
      </div>

      <div className="mt-auto pt-3">
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.1}
          value={duration > 0 ? Math.min(currentTime, duration) : 0}
          onChange={(event) => handleSeek(Number(event.target.value))}
          disabled={!track || duration <= 0}
          aria-label="播放进度"
          className="st-range w-full"
        />
      </div>
    </GadgetPanel>
  );
}
