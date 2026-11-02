import { notFound, redirect } from "next/navigation";
import AccountHeader from "@/components/account/AccountHeader";
import NoteEditor from "@/components/account/NoteEditor";
import Toast from "@/components/Toast";
import SoundEffects from "@/components/SoundEffects";
import { getSession, isAdmin } from "@/lib/auth";
import { loadNoteDraft } from "@/lib/notes";

export const instant = false;

export default async function NoteEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; draft?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/login?error=not_allowed");

  const { slug, draft: draftText } = await searchParams;
  const draft = slug ? await loadNoteDraft(slug) : null;
  if (slug && !draft) notFound();

  return (
    <main className="min-h-screen flex flex-col">
      <AccountHeader user={user} />
      <SoundEffects />
      <div className="flex-1">
        <NoteEditor initial={draft} initialDraft={draftText ?? null} />
      </div>
      <footer className="border-t border-smartisan-hairline bg-smartisan-sunken py-6 text-center font-mono text-[10px] text-smartisan-faint">
        SMARTISAN STUDIO · INSTANT NOTES
      </footer>
      <Toast />
    </main>
  );
}
