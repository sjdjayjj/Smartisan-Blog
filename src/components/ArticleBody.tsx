import type { CSSProperties } from "react";
import MarkdocContent from "@/components/MarkdocContent";

/**
 * 正文渲染的唯一入口：弹窗与 /post/[slug] 独立页共用同一套排版容器，
 * 避免两处各写一份 .article-body 包裹逻辑后逐渐漂移。
 */
export default function ArticleBody({
  nodes,
  lamp = false,
  headingIds = true,
  size,
  leading,
  className = "",
}: {
  nodes: unknown;
  /** 阅读灯：米白纸质底色，仅弹窗内可切换 */
  lamp?: boolean;
  /** 生成标题锚点 id（article-heading-N），目录与深链都依赖它 */
  headingIds?: boolean;
  /** 弹窗内的字号/行距偏好；独立页交给 .article-body 的默认值 */
  size?: number;
  leading?: number;
  className?: string;
}) {
  const style: CSSProperties | undefined =
    size === undefined ? undefined : { fontSize: `${size}px`, lineHeight: leading };
  const wrapper = ["article-body rounded-xl", lamp ? "reading-lamp p-5 sm:p-6" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapper} style={style}>
      <MarkdocContent nodes={nodes} headingIds={headingIds} />
    </div>
  );
}
