"use client";

import { useMemo, useState, type ReactNode } from "react";
import { avatarSrc } from "@/lib/avatar";

/**
 * GitHub 头像三级加载策略：
 * 1. 浏览器直连 GitHub 头像地址（已挂代理时最快）；
 * 2. 直连失败时退回同源 /api/avatar 服务端代理；
 * 3. 全部失败则渲染 fallback（金属占位块）。
 * 会话里没有 avatar_url 时用 github.com/{login}.png 兜底。
 */
export default function UserAvatar({
  avatar,
  login,
  size,
  className = "",
  alt,
  fallback = null,
}: {
  avatar?: string | null;
  login?: string | null;
  size: number;
  className?: string;
  alt?: string;
  fallback?: ReactNode;
}) {
  const sources = useMemo(() => {
    const direct = avatar?.trim() || (login ? `https://github.com/${login}.png?size=${size}` : "");
    if (!direct) return [];
    const proxied = avatarSrc(direct, size);
    return Array.from(new Set([direct, ...(proxied ? [proxied] : [])]));
  }, [avatar, login, size]);

  const [attempt, setAttempt] = useState(0);

  if (!sources[attempt]) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sources[attempt]}
      alt={alt ?? `${login ?? "GitHub"} 的头像`}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setAttempt((value) => value + 1)}
    />
  );
}
