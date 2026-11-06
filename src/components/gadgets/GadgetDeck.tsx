import ClockPanel from "./ClockPanel";
import MusicPanel from "./MusicPanel";
import WeatherPanel from "./WeatherPanel";
import { loadMusicTracks } from "@/lib/music";
import { fallbackLocation } from "@/lib/weather";

/**
 * 桌面模块：一行三张等高卡片，列宽与上方「九宫格文集」完全一致。
 * md 断点两列会出现 2 + 1 的排布，这是预期结果；lg 起恢复一行三列。
 */
export default async function GadgetDeck() {
  // 歌单存 KV，读取失败时 loadMusicTracks 内部已回落静态默认值
  const tracks = await loadMusicTracks();

  return (
    <section id="gadget" className="space-y-6 scroll-mt-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-smartisan-hairline pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-smartisan-gold shadow-gold-glow" />
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-smartisan-ink tracking-wider">
              桌面模块 · Gadgets
            </h2>
          </div>
          <p className="mt-2 text-xs text-smartisan-muted font-sans">
            时钟、天气与音乐：桌面上三件随手可用的小东西
          </p>
        </div>
        <span className="font-mono text-[10px] text-smartisan-gold tracking-widest">
          UTILITY DECK · 03
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <ClockPanel />
        {/* 天气要浏览器定位，坐标拿不到时用服务端下发的兜底城市 */}
        <WeatherPanel fallback={fallbackLocation()} />
        <MusicPanel tracks={tracks} />
      </div>
    </section>
  );
}
