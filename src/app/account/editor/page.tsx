import { notFound, redirect } from "next/navigation";
import AccountHeader from "@/components/account/AccountHeader";
import PostEditor from "@/components/account/PostEditor";
import Toast from "@/components/Toast";
import SoundEffects from "@/components/SoundEffects";
import { getSession, isAdmin } from "@/lib/auth";
import { loadDraft } from "@/lib/github";
import { isR2Configured } from "@/lib/r2";

export const instant = false;

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; draft?: string }>;
}) {
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
        <PostEditor initial={draft} initialDraft={draftText ?? null} r2Ready={isR2Configured()} />
      </div>
      <footer className="border-t border-smartisan-hairline bg-smartisan-sunken py-6 text-center font-mono text-[10px] text-smartisan-faint">
        SMARTISAN STUDIO · WRITING DESK
      </footer>
      <Toast />
    </main>
  );
}
