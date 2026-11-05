"use client";

/**
 * 纯 Web Audio 合成音效：机械微动开关的“咔哒”声与多站点白噪音电台。
 * 不依赖任何音频文件，首次交互时才创建 AudioContext（满足浏览器自动播放策略）。
 */

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  // 是否恢复由调用方决定：发声必须在 resume 完成后进行，否则首帧会被自动播放策略吞掉
  return audioCtx;
}

/** 合成物理微动开关声：三角波快速下滑 + 指数衰减。 */
export function playMechanicalClick(frequency = 800, duration = 0.03) {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    // 首次点击时 context 仍被自动播放策略挂起：先 await resume，恢复后再发声
    ctx
      .resume()
      .then(() => emitClick(ctx, frequency, duration))
      .catch(() => {
        // 浏览器拒绝恢复时静默降级
      });
    return;
  }

  emitClick(ctx, frequency, duration);
}

/** 实际发声；必须在 AudioContext 处于 running 状态后调用。 */
function emitClick(ctx: AudioContext, frequency: number, duration: number) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + duration);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // 音频被浏览器策略限制时静默降级
  }
}

/* ============ 电台站点配置 ============ */

export type StationId =
  | "rain"
  | "vinyl"
  | "fan"
  | "fire"
  | "typewriter"
  | "waves"
  | "train"
  | "cafe";

export type StationSide = "A" | "B";

export interface RadioStation {
  id: StationId;
  side: StationSide;
  frequency: number;
  name: string;
  en: string;
  blurb: string;
}

/** A 面偏深夜室内，B 面偏户外与远行，两面共用一台调频旋钮。 */
export const radioStations: RadioStation[] = [
  {
    id: "rain",
    side: "A",
    frequency: 88.4,
    name: "暗室雨夜",
    en: "RAIN ROOM",
    blurb: "粉红噪声塑形的夜雨，混着远处打字机的敲击。",
  },
  {
    id: "vinyl",
    side: "A",
    frequency: 90.8,
    name: "黑胶唱针",
    en: "VINYL GROOVE",
    blurb: "唱针摩擦的爆豆声与 58Hz 老旧变压器嗡鸣。",
  },
  {
    id: "fan",
    side: "A",
    frequency: 93.2,
    name: "老式电风扇",
    en: "OLD FAN",
    blurb: "三叶扇叶切风的低频摆动，电机稳定的底噪。",
  },
  {
    id: "fire",
    side: "A",
    frequency: 95.6,
    name: "壁炉篝火",
    en: "FIREPLACE",
    blurb: "棕噪声铺底，木柴爆裂声随机落下。",
  },
  {
    id: "typewriter",
    side: "B",
    frequency: 98.4,
    name: "打字机工坊",
    en: "TYPEWRITER",
    blurb: "密集的键杆敲击，纸卷在滚筒上沙沙转动。",
  },
  {
    id: "waves",
    side: "B",
    frequency: 100.8,
    name: "午夜海浪",
    en: "MIDNIGHT SEA",
    blurb: "七秒一次的长涌，浪峰退去留下细碎泡沫。",
  },
  {
    id: "train",
    side: "B",
    frequency: 103.2,
    name: "蒸汽列车",
    en: "STEAM TRAIN",
    blurb: "铁轨接缝的四连击，锅炉的低频轰鸣在持续。",
  },
  {
    id: "cafe",
    side: "B",
    frequency: 105.6,
    name: "深夜咖啡馆",
    en: "NIGHT CAFE",
    blurb: "模糊的人声底噪，偶尔传来杯碟碰撞的清脆。",
  },
];

/* ============ 合成素材 ============ */

type NoiseColor = "white" | "pink" | "brown";

/** 生成可循环噪声缓冲：白噪声最亮，棕噪声最沉。 */
function noiseBuffer(ctx: AudioContext, seconds: number, color: NoiseColor): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let brown = 0;

  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === "white") {
      output[i] = white * 0.4;
      continue;
    }
    if (color === "brown") {
      brown = (brown + 0.02 * white) / 1.02;
      output[i] = brown * 3.2;
      continue;
    }
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    output[i] = (b0 + b1 + b2) * 0.1;
  }
  return buffer;
}

/** 爆豆声：稀疏脉冲叠加指数衰减尾音。 */
function crackleBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    if (Math.random() > 0.0007) continue;
    const amplitude = 0.2 + Math.random() * 0.6;
    const tail = 24 + Math.floor(Math.random() * 120);
    for (let j = 0; j < tail && i + j < length; j++) {
      data[i + j] += amplitude * Math.exp(-j / (tail / 3)) * (Math.random() * 2 - 1);
    }
  }
  return buffer;
}

interface BedOptions {
  color: NoiseColor;
  type: BiquadFilterType;
  frequency: number;
  q?: number;
  gain: number;
  lfo?: { rate: number; depth: number };
}

type SourceList = AudioScheduledSourceNode[];

/** 铺一层经过滤波的噪声，可选 LFO 让音量缓慢起伏。 */
function addBed(
  ctx: AudioContext,
  destination: AudioNode,
  options: BedOptions,
  sources: SourceList
) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, 4, options.color);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = options.type;
  filter.frequency.value = options.frequency;
  filter.Q.value = options.q ?? 0.7;

  const gain = ctx.createGain();
  gain.gain.value = options.gain;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  if (options.lfo) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = options.lfo.rate;
    const depth = ctx.createGain();
    depth.gain.value = options.lfo.depth;
    lfo.connect(depth);
    depth.connect(gain.gain);
    lfo.start();
    sources.push(lfo);
  }

  source.start();
  sources.push(source);
}

function addCrackle(
  ctx: AudioContext,
  destination: AudioNode,
  gainValue: number,
  filterType: BiquadFilterType,
  frequency: number,
  sources: SourceList
) {
  const source = ctx.createBufferSource();
  source.buffer = crackleBuffer(ctx);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;

  const gain = ctx.createGain();
  gain.gain.value = gainValue;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start();
  sources.push(source);
}

function addHum(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  gainValue: number,
  type: OscillatorType,
  sources: SourceList
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(destination);
  osc.start();
  sources.push(osc);
}

/** 老式机械打字：随机间隔敲出一小串字符。 */
function startTyping(
  ctx: AudioContext,
  destination: AudioNode,
  timers: number[],
  options: { gain: number; minGap: number; maxGap: number; minClicks: number; maxClicks: number }
) {
  const typeClick = () => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1100 + Math.random() * 400, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.035);
    gain.gain.setValueAtTime(options.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + 0.07);
  };

  const scheduleBurst = () => {
    const timer = window.setTimeout(() => {
      const clicks =
        options.minClicks + Math.floor(Math.random() * (options.maxClicks - options.minClicks));
      for (let index = 0; index < clicks; index += 1) {
        timers.push(window.setTimeout(typeClick, index * (70 + Math.random() * 110)));
      }
      scheduleBurst();
    }, options.minGap + Math.random() * (options.maxGap - options.minGap));
    timers.push(timer);
  };
  scheduleBurst();
}

/** 铁轨接缝：一组四连击的低频撞击。 */
function startClacks(ctx: AudioContext, destination: AudioNode, timers: number[]) {
  const beat = () => {
    const now = ctx.currentTime;
    for (let index = 0; index < 4; index += 1) {
      const start = now + index * 0.16;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      filter.type = "lowpass";
      filter.frequency.value = 420;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(140 + Math.random() * 40, start);
      osc.frequency.exponentialRampToValueAtTime(55, start + 0.12);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      osc.start(start);
      osc.stop(start + 0.2);
    }
    timers.push(window.setTimeout(beat, 1400 + Math.random() * 300));
  };
  beat();
}

/** 深夜咖啡馆：偶尔一声杯碟清响。 */
function startClinks(ctx: AudioContext, destination: AudioNode, timers: number[]) {
  const ping = () => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1800 + Math.random() * 1400;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + 0.65);
    timers.push(window.setTimeout(ping, 2600 + Math.random() * 6000));
  };
  timers.push(window.setTimeout(ping, 1800));
}

function buildStation(
  ctx: AudioContext,
  destination: AudioNode,
  station: StationId,
  sources: SourceList,
  timers: number[]
) {
  switch (station) {
    case "rain":
      addBed(
        ctx,
        destination,
        {
          color: "pink",
          type: "bandpass",
          frequency: 900,
          q: 0.4,
          gain: 0.3,
          lfo: { rate: 0.09, depth: 0.12 },
        },
        sources
      );
      addCrackle(ctx, destination, 0.1, "highpass", 1200, sources);
      addHum(ctx, destination, 58, 0.012, "sine", sources);
      startTyping(ctx, destination, timers, {
        gain: 0.08,
        minGap: 3200,
        maxGap: 7400,
        minClicks: 2,
        maxClicks: 9,
      });
      break;

    case "vinyl":
      addCrackle(ctx, destination, 0.15, "highpass", 900, sources);
      addBed(
        ctx,
        destination,
        { color: "pink", type: "lowpass", frequency: 700, gain: 0.05 },
        sources
      );
      addHum(ctx, destination, 58, 0.014, "sine", sources);
      break;

    case "fan":
      addBed(
        ctx,
        destination,
        {
          color: "pink",
          type: "bandpass",
          frequency: 420,
          q: 1.2,
          gain: 0.34,
          lfo: { rate: 0.22, depth: 0.09 },
        },
        sources
      );
      addHum(ctx, destination, 50, 0.02, "sine", sources);
      addHum(ctx, destination, 100, 0.007, "triangle", sources);
      break;

    case "fire":
      addBed(
        ctx,
        destination,
        {
          color: "brown",
          type: "lowpass",
          frequency: 700,
          gain: 0.3,
          lfo: { rate: 0.13, depth: 0.1 },
        },
        sources
      );
      addCrackle(ctx, destination, 0.18, "bandpass", 1800, sources);
      break;

    case "typewriter":
      addBed(
        ctx,
        destination,
        { color: "pink", type: "lowpass", frequency: 500, gain: 0.12 },
        sources
      );
      addCrackle(ctx, destination, 0.04, "lowpass", 900, sources);
      startTyping(ctx, destination, timers, {
        gain: 0.1,
        minGap: 900,
        maxGap: 2200,
        minClicks: 5,
        maxClicks: 14,
      });
      break;

    case "waves":
      addBed(
        ctx,
        destination,
        {
          color: "pink",
          type: "bandpass",
          frequency: 520,
          q: 0.5,
          gain: 0.3,
          lfo: { rate: 0.07, depth: 0.26 },
        },
        sources
      );
      addBed(
        ctx,
        destination,
        {
          color: "brown",
          type: "lowpass",
          frequency: 300,
          gain: 0.16,
          lfo: { rate: 0.07, depth: 0.1 },
        },
        sources
      );
      addHum(ctx, destination, 45, 0.008, "sine", sources);
      break;

    case "train":
      addBed(
        ctx,
        destination,
        { color: "brown", type: "lowpass", frequency: 240, gain: 0.34 },
        sources
      );
      addBed(
        ctx,
        destination,
        { color: "pink", type: "bandpass", frequency: 1200, q: 0.9, gain: 0.07 },
        sources
      );
      startClacks(ctx, destination, timers);
      break;

    case "cafe":
      addBed(
        ctx,
        destination,
        { color: "brown", type: "lowpass", frequency: 600, gain: 0.26 },
        sources
      );
      addBed(
        ctx,
        destination,
        { color: "pink", type: "bandpass", frequency: 2200, q: 0.8, gain: 0.04 },
        sources
      );
      startClinks(ctx, destination, timers);
      break;
  }
}

export interface RadioAmbience {
  analyser: AnalyserNode;
  /** 实时调节白噪声静电强度，让旋钮在两个电台之间扫过时有连续变化。 */
  setStatic: (level: number) => void;
  stop: () => void;
}

/**
 * 工匠电台环境声：按站点合成对应的白噪音场景。
 * `station` 为 null 时只播白噪声静电；`staticLevel` 控制静电强度（0–1）。
 * 返回 analyser 供 VU 指针表读取实时电平。
 */
export function createRadioAmbience(
  station: StationId | null = "rain",
  staticLevel = 0
): RadioAmbience | null {
  const ctx = getAudioContext();
  if (!ctx) return null;

  // 电台由点击触发，getAudioContext 不再代为恢复，这里补上以保持旧行为
  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.9);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.85;
  master.connect(analyser);
  analyser.connect(ctx.destination);

  const sources: SourceList = [];
  const timers: number[] = [];

  // 静电层常驻，音量由调频位置实时驱动：靠近电台时安静，偏离时逐渐变响
  const staticSource = ctx.createBufferSource();
  staticSource.buffer = noiseBuffer(ctx, 4, "white");
  staticSource.loop = true;
  const staticFilter = ctx.createBiquadFilter();
  staticFilter.type = "bandpass";
  staticFilter.frequency.value = 2400;
  staticFilter.Q.value = 0.5;
  const staticGainNode = ctx.createGain();
  staticGainNode.gain.value = 0.0001;
  staticSource.connect(staticFilter);
  staticFilter.connect(staticGainNode);
  staticGainNode.connect(master);
  staticSource.start();
  sources.push(staticSource);

  const staticGain = Math.min(1, Math.max(0, staticLevel));
  if (staticGain > 0.01) {
    staticGainNode.gain.setTargetAtTime(0.16 * staticGain, ctx.currentTime, 0.08);
  }

  if (station) {
    buildStation(ctx, master, station, sources, timers);
  } else if (staticGain <= 0.02) {
    // 既没有电台也没有静电时，至少保留一点空气感底噪
    addBed(
      ctx,
      master,
      { color: "pink", type: "lowpass", frequency: 800, gain: 0.08 },
      sources
    );
  }

  return {
    analyser,
    setStatic: (level: number) => {
      const target = 0.16 * Math.min(1, Math.max(0, level));
      staticGainNode.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    },
    stop: () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.length = 0;
      try {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0.0001, now + 0.4);
        sources.forEach((source) => {
          try {
            source.stop(now + 0.45);
          } catch {
            // 已停止的音源忽略
          }
        });
      } catch {
        // 关闭阶段异常直接忽略
      }
      window.setTimeout(() => {
        try {
          master.disconnect();
          analyser.disconnect();
        } catch {
          // 已断开时忽略
        }
      }, 600);
    },
  };
}
