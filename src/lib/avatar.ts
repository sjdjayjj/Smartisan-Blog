/**
 * GitHub 头像统一走站内代理：
 * 国内网络直连 avatars.githubusercontent.com 常被阻断，服务端取回后再同源输出。
 */
export function avatarSrc(raw: string | null | undefined, size = 160): string | null {
  if (!raw) return null;
  return `/api/avatar?u=${encodeURIComponent(raw)}&s=${size}`;
}
