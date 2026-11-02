import { NextResponse } from "next/server";
import {
  callbackUri,
  createSessionToken,
  exchangeCode,
  fetchGithubUser,
  isAdmin,
  isAuthConfigured,
  SESSION_COOKIE,
  sessionCookieOptions,
  STATE_COOKIE,
  stateCookieOptions,
} from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  if (!isAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/login?error=state", request.url));
  }

  const accessToken = await exchangeCode(code, callbackUri(request));
  if (!accessToken) {
    return NextResponse.redirect(new URL("/login?error=token", request.url));
  }

  const profile = await fetchGithubUser(accessToken);
  if (!profile) {
    return NextResponse.redirect(new URL("/login?error=profile", request.url));
  }
  if (!isAdmin(profile)) {
    return NextResponse.redirect(new URL("/login?error=not_allowed", request.url));
  }

  const response = NextResponse.redirect(new URL("/account", request.url));
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(profile),
    sessionCookieOptions(request)
  );
  response.cookies.set(STATE_COOKIE, "", stateCookieOptions(request));
  return response;
}
