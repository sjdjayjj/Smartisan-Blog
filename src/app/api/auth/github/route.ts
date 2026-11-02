import { NextResponse } from "next/server";
import {
  callbackUri,
  isAuthConfigured,
  newState,
  oauthAuthorizeUrl,
  STATE_COOKIE,
  stateCookieOptions,
} from "@/lib/auth";

export async function GET(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }
  const state = newState();
  const response = NextResponse.redirect(
    oauthAuthorizeUrl(callbackUri(request), state)
  );
  response.cookies.set(STATE_COOKIE, state, stateCookieOptions(request));
  return response;
}
