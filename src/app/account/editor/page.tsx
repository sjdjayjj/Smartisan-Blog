import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import AccountHeader from "@/components/account/AccountHeader";
import PostEditor from "@/components/account/PostEditor";
import Toast from "@/components/Toast";
import SoundEffects from "@/components/SoundEffects";
import { isAiConfigAvailable } from "@/lib/ai-config-store";
import { getSession, isAdmin } from "@/lib/auth";
import { loadDraft } from "@/lib/github";
import { isR2Configured } from "@/lib/r2";

export const instant = false;

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; draft?: string }>;
}) {
  // 会话过期判断依赖当前时间，声明为请求时渲染，避免预渲染阶段的 Date.now() 告警
  await connection();

  const user = await getSession();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/login?error=not_allowed");

  const { slug, draft: draftText } = await searchParams;
  const draft = slug ? await loadDraft(slug) : null;
  if (slug && !draft) notFound();

  return (
    <main className="min-h-screen flex flex-col">
      <AccountHeader user={user} />
      <SoundEffects />
      <div className="flex-1">
        <PostEditor
          initial={draft}
          initialDraft={draftText ?? null}
          r2Ready={isR2Configured()}
          aiReady={isAiConfigAvailable()}
        />
      </div>
      <footer className="border-t border-smartisan-hairline bg-smartisan-sunken py-6 text-center font-mono text-[10px] text-smartisan-faint">
        SMARTISAN STUDIO · WRITING DESK
      </footer>
      <Toast />
    </main>
  );
}
