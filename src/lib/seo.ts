/**
 * 站点绝对地址：线上读取 SITE_URL，未配置时回退到示例域名。
 * 仅服务端使用（sitemap / robots / RSS / metadataBase），不要引入到客户端组件。
 */

export const siteUrl = (
  process.env.SITE_URL?.trim() || "https://blog.sjdjayjj.eu.org"
).replace(/\/$/, "");

export function absoluteUrl(pathname = "/"): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${siteUrl}${path}`;
}
