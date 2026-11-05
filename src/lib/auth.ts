import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * 极简 GitHub OAuth 会话：授权码换取身份，白名单校验后写入 HMAC 签名 Cookie。
 * 文章写入使用独立的 GITHUB 令牌，OAuth access token 不落盘、不进 Cookie。
 */

export const SESSION_COOKIE = "sb_session";
export const STATE_COOKIE = "sb_oauth_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export interface SessionUser {
  login: string;
  name: string;
  avatar: string;
  profile: string;
}

interface SessionPayload {
  user: SessionUser;
  exp: number;
}

function authSecret(): string {
  return process.env.AUTH_SECRET ?? "";
}

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_OAUTH_CLIENT_ID &&
      process.env.GITHUB_OAUTH_CLIENT_SECRET &&
      process.env.AUTH_SECRET
  );
}

export function adminLogins(): string[] {
  return (process.env.ADMIN_GITHUB_LOGINS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string): string {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = {
    user,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token: string | undefined): SessionUser | null {
  if (!token || !authSecret()) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload?.user?.login || payload.exp * 1000 < Date.now()) return null;
    return payload.user;
  } catch {
    return null;
  }
}

/** 在服务端组件 / 路由处理器中读取当前登录用户。 */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions(request: Request) {
  const secure =
    process.env.NODE_ENV === "production" ||
    new URL(request.url).protocol === "https:";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export function stateCookieOptions(request: Request) {
  return { ...sessionCookieOptions(request), maxAge: 600 };
}

export function callbackUri(request: Request): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return `${configured.replace(/\/$/, "")}/api/auth/github/callback`;
  return new URL("/api/auth/github/callback", request.url).toString();
}

export function oauthAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: "read:user",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function newState(): string {
  return randomBytes(16).toString("hex");
}

export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<string | null> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function fetchGithubUser(accessToken: string): Promise<SessionUser | null> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "smartisan-blog",
    },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    login?: string;
    name?: string | null;
    avatar_url?: string;
    html_url?: string;
  };
  if (!data.login) return null;
  return {
    login: data.login,
    name: data.name ?? data.login,
    avatar: data.avatar_url ?? "",
    profile: data.html_url ?? `https://github.com/${data.login}`,
  };
}

export function isAdmin(user: SessionUser | null): boolean {
  if (!user) return false;
  const allow = adminLogins();
  return allow.includes(user.login.toLowerCase());
}

export type AdminGuard =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Route Handler 统一鉴权入口：未登录 / 非白名单都返回 401。
 * 这样新增接口不会因为漏写判断而裸奔。
 */
export async function requireAdmin(): Promise<AdminGuard> {
  const user = await getSession();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "请先登录" }, { status: 401 }) };
  }
  if (!isAdmin(user)) {
    return { ok: false, response: NextResponse.json({ error: "没有编辑权限" }, { status: 401 }) };
  }
  return { ok: true, user };
}
