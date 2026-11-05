import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import AccountHeader from "@/components/account/AccountHeader";
import AiSettings from "@/components/account/AiSettings";
import Toast from "@/components/Toast";
import SoundEffects from "@/components/SoundEffects";
import { getSession, isAdmin } from "@/lib/auth";
import { aiConfigStorageMode, readMaskedAiConfig } from "@/lib/ai-config-store";

export const instant = false;

export default async function AiSettingsPage() {
  // 会话校验依赖当前时间（exp 判断），必须声明为请求时渲染，
  // 否则 cacheComponents 在预渲染阶段会因 Date.now() 报不稳定值错误。
  await connection();

  const user = await getSession();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/login?error=not_allowed");

  const storage = aiConfigStorageMode();
  const config = storage === "none" ? null : await readMaskedAiConfig().catch(() => null);

  return (
    <main className="min-h-screen flex flex-col">
      <AccountHeader user={user} />
      <SoundEffects />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 flex-1 w-full space-y-8">
        <section className="st-card rounded-2xl p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-5 right-5 st-seal text-[10px]">机密仓</div>
          <div className="flex items-start gap-4">
            <Link
              href="/account"
              className="st-btn w-9 h-9 rounded-lg flex items-center justify-center text-smartisan-muted hover:text-smartisan-ink shrink-0"
              aria-label="返回工坊"
            >
              <ArrowLeft size={14} />
            </Link>
            <div className="min-w-0 space-y-1.5">
              <h1 className="font-serif text-xl sm:text-2xl font-bold text-smartisan-ink flex items-center gap-2">
                <SlidersHorizontal size={17} className="text-smartisan-red" />
                AI 设置
              </h1>
              <p className="text-xs text-smartisan-muted font-sans leading-6">
                每把 Key 以 AES-256-GCM 加密后存入 Cloudflare KV，明文只在本机服务端解密使用。
                Key 输入框留空表示沿用已保存的旧值。
              </p>
            </div>
          </div>
        </section>

        <AiSettings
          storage={storage}
          initialProviders={config?.providers ?? []}
          initialDefaultProviderId={config?.defaultProviderId ?? ""}
          initialUpdatedAt={config?.updatedAt ?? null}
        />

        <p className="font-mono text-[10px] leading-5 text-smartisan-faint">
          加密主密钥由 AUTH_SECRET 经 HKDF 派生。轮换 AUTH_SECRET 会使已保存的 Key 无法解密，需要重新录入。
        </p>
      </div>

      <footer className="border-t border-smartisan-hairline bg-smartisan-sunken py-6 text-center font-mono text-[10px] text-smartisan-faint">
        SMARTISAN STUDIO · AI CONFIG VAULT
      </footer>

      <Toast />
    </main>
  );
}
