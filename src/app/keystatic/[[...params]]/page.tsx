'use client';
// Keystatic 后台（纯客户端 SPA）。
// Next 16 (Turbopack + cacheComponents) 下 @keystatic/next 的 makePage 会在 RSC 预渲染 pass
// 中因 config 跨序列化失败而 500，故内联等价实现：直接挂载 <Keystatic/>，
// 子路径（如 /keystatic/collection/posts）由可选 catch-all 路由 + SPA 内部路由接管。
import type { ComponentProps } from 'react';
import { Keystatic } from '@keystatic/core/ui';
import config from '../../../../keystatic.config';

// Keystatic 内部对 config 泛型推断与项目本地 config 的字面量类型存在出入，
// 运行时完全兼容，此处仅收敛 TS 类型。
const keystaticConfig = config as unknown as ComponentProps<typeof Keystatic>['config'];

export default function KeystaticPage() {
  return (
    <Keystatic
      config={keystaticConfig}
      appSlug={{
        envName: 'NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG',
        value: process.env.NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG,
      }}
    />
  );
}
