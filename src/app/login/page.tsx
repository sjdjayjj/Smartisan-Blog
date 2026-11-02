import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, GitBranch, ShieldCheck } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { getSession, isAdmin, isAuthConfigured } from "@/lib/auth";
import { site } from "@/lib/site";

export const instant = false;

const ERROR_TEXT: Record<string, string> = {
  config: "GitHub OAuth 尚未配置，请先在环境变量中填写 Client ID / Secret。",
  state: "登录状态校验失败，请重新发起登录。",
  token: "GitHub 未返回访问令牌，请稍后再试。",
  profile: "读取 GitHub 账号信息失败。",
  not_allowed: "该 GitHub 账号不在白名单内，无法进入工坊。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (isAdmin(session)) redirect("/account");

  const { error } = await searchParams;
  const configured = isAuthConfigured();
  const message = error ? ERROR_TEXT[error] ?? "登录失败，请重试。" : null;

  return (
    <main className="min-h-screen flex flex-col">
      <div className="st-fine-red-line border-b border-smartisan-hairline bg-smartisan-header/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-smartisan-muted hover:text-smartisan-ink transition font-sans">
            <ArrowLeft size={14} />
            返回首页
          </Link>
          <div className="flex items-center gap-3">
            <span className="sm:hidden">
              <ThemeToggle variant="compact" />
            </span>
            <span className="hidden sm:inline-flex">
              <ThemeToggle />
            </span>
            <span className="font-mono text-[10px] tracking-[0.2em] text-smartisan-muted uppercase">
              {site.handle}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <section className="st-card rounded-2xl p-8 sm:p-10 w-full max-w-md relative overflow-hidden">
          <div className="absolute top-5 right-5 st-seal text-[10px]">工坊重地</div>

          <div className="flex items-center gap-2 mb-6">
            <span className="w-2 h-2 rounded-full bg-smartisan-red shadow-red-glow" />
            <span className="font-mono text-[11px] tracking-[0.2em] text-smartisan-gold uppercase">
              Author Access
            </span>
          </div>

          <h1 className="font-serif text-2xl font-bold text-smartisan-ink tracking-wide">
            作者入口
          </h1>
          <p className="mt-2 text-xs text-smartisan-muted font-sans leading-relaxed">
            使用 GitHub 账号验证身份。仅站长白名单可进入工坊，编辑与发布文章。
          </p>

          <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-smartisan-red to-transparent shadow-red-glow my-6" />

          {message ? (
            <div className="mb-5 rounded-lg border border-smartisan-red/30 bg-smartisan-red/10 px-3 py-2 text-xs text-smartisan-red-light font-sans">
              {message}
            </div>
          ) : null}

          {configured ? (
            <a
              href="/api/auth/github"
              className="st-btn w-full rounded-xl px-5 py-3 flex items-center justify-center gap-2.5 text-sm font-sans text-smartisan-ink"
            >
              <GitBranch size={16} className="text-smartisan-gold" />
              使用 GitHub 登录
            </a>
          ) : (
            <div className="rounded-xl st-well p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-sans text-smartisan-gold">
                <ShieldCheck size={13} />
                尚未配置登录凭据
              </div>
              <p className="text-[11px] text-smartisan-muted leading-relaxed font-sans">
                在 <code className="font-mono text-smartisan-text">.env.local</code> 中填写：
              </p>
              <pre className="font-mono text-[10px] leading-relaxed text-smartisan-text/80 whitespace-pre-wrap">
{`GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
AUTH_SECRET=
ADMIN_GITHUB_LOGINS=`}
              </pre>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between font-mono text-[10px] text-smartisan-muted">
            <span>SECURE / HMAC-SIGNED SESSION</span>
            <span>© 2026</span>
          </div>
        </section>
      </div>
    </main>
  );
}
