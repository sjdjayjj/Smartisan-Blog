import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ListMusic } from "lucide-react";
import AccountHeader from "@/components/account/AccountHeader";
import MusicManager from "@/components/account/MusicManager";
import Toast from "@/components/Toast";
import SoundEffects from "@/components/SoundEffects";
import { getSession, isAdmin } from "@/lib/auth";
import { isKvConfigured } from "@/lib/kv";
import { loadMusicTracks } from "@/lib/music";
import { isR2Configured } from "@/lib/r2";

export const instant = false;

export default async function MusicPlaylistPage() {
  // 会话过期判断依赖当前时间，声明为请求时渲染
  await connection();

  const user = await getSession();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/login?error=not_allowed");

  const tracks = await loadMusicTracks();

  return (
    <main className="min-h-screen flex flex-col">
      <AccountHeader user={user} />
      <SoundEffects />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 flex-1 w-full space-y-8">
        <section className="st-card rounded-2xl p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-5 right-5 st-seal text-[10px]">自留地</div>
          <div className="flex items-start gap-4">
            <Link
              href="/account"
              className="st-btn st-btn-icon-md flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink shrink-0"
              aria-label="返回工坊"
            >
              <ArrowLeft size={14} />
            </Link>
            <div className="min-w-0 space-y-1.5">
              <h1 className="font-serif text-xl sm:text-2xl font-bold text-smartisan-ink flex items-center gap-2">
                <ListMusic size={17} className="text-smartisan-red" />
                歌单管理
              </h1>
              <p className="text-xs text-smartisan-muted font-sans leading-6">
                歌单整份存入 Cloudflare KV，保存后首页刷新即可生效。音频走 R2 直传，
                上传成功会自动回填地址并读取时长。
              </p>
            </div>
          </div>
        </section>

        <MusicManager
          initialTracks={tracks}
          kvReady={isKvConfigured()}
          r2Ready={isR2Configured()}
        />

        <p className="font-mono text-[10px] leading-5 text-smartisan-faint">
          只放自有版权或 CC0 / CC-BY 曲目，并在艺术家一栏标注出处与许可。原生
          &lt;audio&gt; 播放不需要 CORS；能否拖动进度条取决于 R2 对象是否支持 Range。
        </p>
      </div>

      <footer className="border-t border-smartisan-hairline bg-smartisan-sunken py-6 text-center font-mono text-[10px] text-smartisan-faint">
        SMARTISAN STUDIO · MUSIC PLAYLIST
      </footer>

      <Toast />
    </main>
  );
}
