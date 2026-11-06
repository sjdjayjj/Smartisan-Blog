/**
 * 站点级静态配置：文案、统计、便签与分类元信息。
 * 修改这里即可替换首页的展示内容，无需改组件。
 */

export type CategoryKey = "thinking" | "system" | "aesthetic";

export const site = {
  name: "理想主义者的自留地",
  tagline: "Smartisan Craftsmanship",
  handle: "@smartisandesign",
  author: "工匠精神 · Craftsmanship",
  quote: "“我不在乎输赢，我只是认真。怀揣工匠之心，在浮躁喧嚣的时代打磨数字物件。”",
  bio: "专注于现代前端架构、精致拟物化交互设计以及极简工业美学。偏执于 1px 的对齐、柔和的环境光遮蔽与纯粹的内容排版。",
  footerQuote: "“圆滑当道时代的锐利异类”",
  footerNote: "Inspired by Smartisan OS © 2026. Built with Pride & Craftsmanship.",
} as const;

/* 导航全部指向首页锚点（写成 /#xxx）：在 /post/[slug] 独立页点击也能回到首页对应区块 */
export const navItems: ReadonlyArray<{ href: string; label: string; dot?: boolean }> = [
  { href: "/#articles", label: "文集 Articles", dot: true },
  { href: "/#note", label: "便签 Notes" },
  { href: "/#about", label: "关于 About" },
  { href: "/#gadget", label: "桌面模块 Gadgets" },
];

/* 首页桌面模块的默认城市与时区；城市坐标可用 WEATHER_* 环境变量覆盖 */
export const gadgetCity = {
  name: "杭州",
  latitude: 30.2741,
  longitude: 120.1551,
  timeZone: "Asia/Shanghai",
} as const;

export const categoryMeta: Record<
  CategoryKey,
  { label: string; badge: string; badgeClass: string }
> = {
  aesthetic: {
    label: "产品美学",
    badge: "DESIGN AESTHETIC",
    badgeClass:
      "text-smartisan-red bg-smartisan-red/10 border border-smartisan-red/30",
  },
  system: {
    label: "系统折腾",
    badge: "SYSTEM HACK",
    badgeClass:
      "text-smartisan-gold bg-smartisan-gold/10 border border-smartisan-gold/30",
  },
  thinking: {
    label: "思考与架构",
    badge: "THINKING & CRAFT",
    badgeClass: "text-smartisan-muted bg-smartisan-veil border border-smartisan-line",
  },
};

export const categoryFilters = [
  { key: "all", label: "全部", en: "All" },
  { key: "aesthetic", label: "产品美学", en: "Design" },
  { key: "system", label: "系统折腾", en: "Tech" },
  { key: "thinking", label: "思考与架构", en: "Life" },
] as const;
