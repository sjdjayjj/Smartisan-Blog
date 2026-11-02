"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCw } from "lucide-react";
import {
  createRadioAmbience,
  playMechanicalClick,
  radioStations,
  type RadioAmbience,
  type RadioStation,
  type StationId,
  type StationSide,
} from "@/lib/audio";
import { showToast } from "@/lib/bus";

const VU_TICKS = [-32, -21, -11, 0, 11, 21, 32];

/** 频段范围：A/B 两面各自占半段刻度，站点之间留出静电间隔。 */
const BANDS: Record<StationSide, { start: number; end: number; label: string }> = {
  A: { start: 88, end: 96.8, label: "CRAFT RADIO" },
  B: { start: 98, end: 106.8, label: "NIGHT SHIFT" },
};

function stationsOfSide(side: StationSide) {
  return radioStations.filter((station) => station.side === side);
}

/** 频率越靠近站点越清晰，越靠近刻度中间越像白噪声静电。 */
function resolveStation(frequency: number, side: StationSide) {
  const list = stationsOfSide(side);
  let nearest = list[0];
  for (const station of list) {
    if (Math.abs(station.frequency - frequency) < Math.abs(nearest.frequency - frequency)) {
      nearest = station;
    }
  }
  const distance = Math.abs(nearest.frequency - frequency);
  const staticLevel = Math.min(1, Math.max(0, (distance - 0.45) / 0.55));
  return {
    station: distance <= 1 ? nearest : null,
    staticLevel,
  };
}

export default function Gadget() {
  const [playing, setPlaying] = useState(false);
  const [side, setSide] = useState<StationSide>("A");
  const [frequency, setFrequency] = useState(88.4);
  const [tunedId, setTunedId] = useState<StationId | null>("rain");

  const radioRef = useRef<RadioAmbience | null>(null);
  const needleRef = useRef<HTMLSpanElement | null>(null);
  const playingRef = useRef(false);
  const currentStationRef = useRef<StationId | null>(null);
  const retuneTimerRef = useRef(0);

  const sideStations = stationsOfSide(side);
  const band = BANDS[side];
  const activeStation = radioStations.find((station) => station.id === tunedId) ?? null;

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    return () => {
      window.clearTimeout(retuneTimerRef.current);
      radioRef.current?.stop();
      radioRef.current = null;
    };
  }, []);

  // 用 analyser 的时域数据驱动 VU 指针，60fps 直接改 style，不经过 React 渲染
  useEffect(() => {
    const needle = needleRef.current;
    if (!playing) {
      if (needle) needle.style.transform = "rotate(-32deg)";
      return;
    }

    const data = new Uint8Array(512);
    let frame = 0;

    const tick = () => {
      const analyser = radioRef.current?.analyser;
      const target = needleRef.current;
      if (analyser && target) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let index = 0; index < data.length; index += 1) {
          const value = (data[index] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / data.length);
        const level = Math.min(1, rms * 5.5);
        target.style.transform = `rotate(${(-32 + level * 64).toFixed(1)}deg)`;
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);

  /** 换台：旧电台渐弱退场，新电台像调频一样淡入。 */
  const switchAmbience = (station: StationId | null, staticLevel: number) => {
    const next = createRadioAmbience(station, staticLevel);
    if (!next) {
      showToast("当前浏览器不支持 Web Audio");
      return false;
    }
    const previous = radioRef.current;
    radioRef.current = next;
    currentStationRef.current = station;
    if (previous) window.setTimeout(() => previous.stop(), 220);

    const info = radioStations.find((item) => item.id === station);
    showToast(
      info
        ? `SIDE ${info.side} · ${info.frequency.toFixed(1)} MHz · ${info.name}`
        : "旋钮停在刻度之间：只有白噪声静电"
    );
    return true;
  };

  /** 拖动旋钮：静电层跟着刻度即时报响，标题同步切换。 */
  const applyTuning = (value: number, sideValue: StationSide) => {
    const resolved = resolveStation(value, sideValue);
    setTunedId(resolved.station?.id ?? null);
    radioRef.current?.setStatic(resolved.staticLevel);
    return resolved;
  };

  /** 换台比静电慢半拍，避免扫频时反复重建音源。 */
  const scheduleTune = (value: number) => {
    const resolved = applyTuning(value, side);
    window.clearTimeout(retuneTimerRef.current);
    if (!playingRef.current) return;
    if (resolved.station?.id === currentStationRef.current) return;
    retuneTimerRef.current = window.setTimeout(() => {
      switchAmbience(resolved.station?.id ?? null, resolved.staticLevel);
    }, 180);
  };

  const tuneToStation = (station: RadioStation) => {
    playMechanicalClick(920, 0.04);
    setFrequency(station.frequency);
    applyTuning(station.frequency, side);
    window.clearTimeout(retuneTimerRef.current);
    if (!playingRef.current) return;
    if (station.id === currentStationRef.current) return;
    switchAmbience(station.id, 0);
  };

  const toggleRadio = () => {
    playMechanicalClick(1100, 0.05);
    if (!playing) {
      const resolved = resolveStation(frequency, side);
      const started = switchAmbience(resolved.station?.id ?? null, resolved.staticLevel);
      if (!started) return;
      setTunedId(resolved.station?.id ?? null);
      setPlaying(true);
      return;
    }
    radioRef.current?.stop();
    radioRef.current = null;
    currentStationRef.current = null;
    setPlaying(false);
    if (needleRef.current) needleRef.current.style.transform = "rotate(-32deg)";
    showToast("电台已停止");
  };

  const flipSide = () => {
    playMechanicalClick(680, 0.04);
    const nextSide: StationSide = side === "A" ? "B" : "A";
    const first = stationsOfSide(nextSide)[0];
    setSide(nextSide);
    setFrequency(first.frequency);
    setTunedId(first.id);
    window.clearTimeout(retuneTimerRef.current);
    if (playingRef.current) switchAmbience(first.id, 0);
    showToast(`磁带翻面：SIDE ${nextSide} · ${BANDS[nextSide].label}`);
  };

  const nextStation = () => {
    const index = sideStations.findIndex((station) => station.id === tunedId);
    const nextIndex = index < 0 ? 0 : (index + 1) % sideStations.length;
    tuneToStation(sideStations[nextIndex]);
  };

  return (
    <section
      id="gadget"
      className="st-card rounded-2xl p-6 sm:p-8 relative overflow-hidden border border-smartisan-line scroll-mt-24"
    >
      <span className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-smartisan-highlight to-transparent" />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
        <div>
          <h2 className="font-serif text-lg sm:text-xl font-bold text-smartisan-ink">
            工匠电台 · CRAFTSMAN RADIO
          </h2>
          <p className="mt-2 text-xs text-smartisan-muted font-sans">
            双面磁带 · 八个白噪音站点 · 旋钮扫过刻度时会漏出白噪声静电
          </p>
        </div>
        <span className="font-mono text-[11px] text-smartisan-gold tracking-widest">
          FM {frequency.toFixed(1)} MHz
        </span>
      </div>

      <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-between">
        {/* 磁带本体与卷轴 */}
        <div
          key={side}
          className="cassette is-flipping shrink-0"
          aria-label={`磁带 SIDE ${side}`}
        >
          <div className="cassette-label">
            <span>
              SIDE {side} · {band.label}
            </span>
            <span className="font-bold">{activeStation?.name ?? "STATIC"}</span>
          </div>
          <div className="cassette-window">
            <span className="cassette-tape" aria-hidden="true" />
            <span className={`reel ${playing ? "reel-spin" : ""}`} aria-hidden="true" />
            <span
              className={`reel ${playing ? "reel-spin-reverse" : ""}`}
              aria-hidden="true"
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[9px] text-smartisan-muted tracking-widest px-1">
            <span>C-60 · TYPE II</span>
            <span className={playing ? "text-smartisan-red" : ""}>
              {playing ? "TAPE RUN" : "PAUSED"}
            </span>
          </div>
        </div>

        {/* 调频与电平显示 */}
        <div className="w-full space-y-4 lg:max-w-[400px] lg:flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full inline-block ${
                  playing ? "bg-green-500 animate-ping" : "bg-smartisan-line-strong"
                }`}
              />
              <span className="font-mono text-[10px] text-smartisan-gold tracking-widest uppercase">
                {activeStation?.en ?? "WHITE NOISE"}
              </span>
            </div>
            <span className="font-mono text-[10px] text-smartisan-muted tracking-widest">
              {activeStation?.frequency.toFixed(1) ?? "--.-"} / {band.end.toFixed(1)}
            </span>
          </div>

          <h3 className="font-serif text-lg font-bold text-smartisan-ink leading-snug">
            {activeStation ? activeStation.name : "刻度之间的静电"}
          </h3>
          <p className="text-xs text-smartisan-muted leading-relaxed">
            {activeStation
              ? activeStation.blurb
              : "两个电台之间的空隙只剩白噪声，像旋钮在刻度上来回扫动的声音。"}
          </p>

          {/* 拟物 VU 指针表 */}
          <div className="st-well rounded-xl p-2.5 w-full">
            <div className="vu-meter">
              {VU_TICKS.map((deg) => (
                <span
                  key={deg}
                  className="vu-tick"
                  style={{ transform: `rotate(${deg}deg)` }}
                  aria-hidden="true"
                />
              ))}
              <span ref={needleRef} className="vu-needle" aria-hidden="true" />
              <span className="vu-pivot" aria-hidden="true" />
              <span className="vu-label" style={{ left: 10 }}>
                -20
              </span>
              <span className="vu-label" style={{ left: "50%", transform: "translateX(-50%)" }}>
                0
              </span>
              <span className="vu-label" style={{ right: 10 }}>
                +3
              </span>
            </div>
            <div className="flex justify-between mt-1.5 px-1 font-mono text-[9px] text-smartisan-muted tracking-widest">
              <span>VU METER</span>
              <span className={playing ? "text-smartisan-red" : ""}>
                {playing ? "ON AIR" : "STANDBY"}
              </span>
            </div>
          </div>

          {/* 调频刻度盘 */}
          <div className="space-y-1.5">
            <input
              type="range"
              min={band.start}
              max={band.end}
              step={0.1}
              value={frequency}
              onChange={(event) => {
                const value = Number(event.target.value);
                setFrequency(value);
                scheduleTune(value);
              }}
              aria-label={`SIDE ${side} 调频`}
              className="tuner-slider"
            />
            <div className="flex justify-between font-mono text-[9px] text-smartisan-muted tracking-widest">
              <span>{band.start.toFixed(1)}</span>
              <span>SIDE {side}</span>
              <span>{band.end.toFixed(1)}</span>
            </div>
          </div>

          {/* 站点预置按钮 */}
          <div className="flex flex-wrap gap-2">
            {sideStations.map((station) => (
              <button
                key={station.id}
                type="button"
                onClick={() => tuneToStation(station)}
                aria-pressed={tunedId === station.id}
                className={`category-btn st-btn tap-40-y relative inline-flex items-center min-h-8 px-3 rounded-md font-mono text-[10px] transition ${
                  tunedId === station.id
                    ? "text-smartisan-gold border-smartisan-gold/40"
                    : "text-smartisan-muted hover:text-smartisan-ink"
                }`}
              >
                {station.frequency.toFixed(1)} {station.name}
              </button>
            ))}
          </div>
        </div>

        {/* 物理操作区 */}
        <div className="flex items-center gap-3 shrink-0 lg:w-36 lg:flex-col lg:items-stretch">
          <button
            type="button"
            onClick={toggleRadio}
            aria-pressed={playing}
            className="tap-44-y relative st-btn px-6 py-3 rounded-xl font-mono text-xs text-smartisan-ink flex items-center justify-center gap-2.5 shadow-lg border border-smartisan-line active:scale-95 transition lg:w-full"
          >
            {playing ? (
              <Pause size={13} className="text-smartisan-red" />
            ) : (
              <Play size={13} className="text-smartisan-red" />
            )}
            <span>{playing ? "暂停电台" : "启动电台"}</span>
          </button>

          <div className="flex items-center gap-2 lg:w-full">
            <button
              type="button"
              onClick={flipSide}
              title="切换磁带 A/B 面"
              className="tap-44-y relative st-btn px-3 h-10 rounded-lg font-mono text-[10px] text-smartisan-muted hover:text-smartisan-ink tracking-widest lg:flex-1"
            >
              翻面 {side === "A" ? "B" : "A"}
            </button>
            <button
              type="button"
              onClick={nextStation}
              title="下一台"
              aria-label="下一台"
              className="tap-44 relative st-btn w-10 h-10 rounded-lg flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink"
            >
              <RotateCw size={13} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
