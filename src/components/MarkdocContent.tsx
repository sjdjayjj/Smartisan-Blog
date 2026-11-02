"use client";

import type { ReactNode } from "react";

/**
 * Keystatic 的 reader 返回的是 Markdoc AST（`Node` 实例转成的纯对象），
 * 与 `DocumentRenderer` 期望的 Keystatic 文档结构不同：
 * 文本内容存放在 `attributes.content`，而非 `text` 字段。
 * 这里针对 Markdoc 节点类型做一层轻量渲染，避免依赖内部转换。
 */

type MarkdocNode = {
  type?: string;
  attributes?: Record<string, unknown>;
  children?: MarkdocNode[];
};

/** 渲染上下文：标题序号用于生成锚点 id，保证与目录顺序一致。 */
type RenderCtx = { heading: number; withIds: boolean };

function childNodes(node: MarkdocNode): MarkdocNode[] {
  return Array.isArray(node.children) ? node.children : [];
}

function attr(node: MarkdocNode, key: string): string {
  const value = node.attributes?.[key];
  return typeof value === "string" ? value : "";
}

function attrNumber(node: MarkdocNode, key: string): number | undefined {
  const value = Number(node.attributes?.[key]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Markdoc 不解析原始 HTML，`<video>` / `<audio>` 会被当作文本节点整体保留。 */
function rawMedia(html: string, key: string): ReactNode {
  const trimmed = html.trim();
  if (!/^<(video|audio)\b/i.test(trimmed)) return null;
  const match = /src\s*=\s*("([^"]*)"|'([^']*)')/i.exec(trimmed);
  const src = match?.[2] ?? match?.[3] ?? "";
  if (!src) return null;
  if (/^<video/i.test(trimmed)) {
    return (
      <video
        key={key}
        src={src}
        controls
        playsInline
        className="w-full rounded-lg border border-smartisan-line bg-black"
      />
    );
  }
  return <audio key={key} src={src} controls className="w-full" />;
}

function renderInline(nodes: MarkdocNode[], prefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;
    const type = node.type ?? "";

    if (type === "text") {
      const content = attr(node, "content");
      return rawMedia(content, key) ?? (content || null);
    }

    if (type === "softbreak") {
      return " ";
    }

    if (type === "hardbreak") {
      return <br key={key} />;
    }

    if (type === "code") {
      return <code key={key}>{attr(node, "content")}</code>;
    }

    const children = renderInline(childNodes(node), key);

    switch (type) {
      case "strong":
        return <strong key={key}>{children}</strong>;
      case "em":
        return <em key={key}>{children}</em>;
      case "s":
      case "strikethrough":
        return <s key={key}>{children}</s>;
      case "link":
        return (
          <a key={key} href={attr(node, "href") || "#"}>
            {children}
          </a>
        );
      case "image": {
        const width = attrNumber(node, "width");
        const height = attrNumber(node, "height");
        // 仅在宽高成对出现时写入尺寸，提前占位、避免图片加载后的布局跳动
        const dims = width && height ? { width, height } : {};
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={key}
            src={attr(node, "src")}
            alt={attr(node, "alt")}
            title={attr(node, "title") || undefined}
            {...dims}
            loading="lazy"
            decoding="async"
            className="rounded-lg max-w-full"
          />
        );
      }
      case "inline":
      case "paragraph":
        return <span key={key}>{children}</span>;
      default:
        return <span key={key}>{children}</span>;
    }
  });
}

function renderBlocks(
  nodes: MarkdocNode[],
  prefix: string,
  ctx: RenderCtx = { heading: 0, withIds: false }
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;
    const type = node.type ?? "";
    const children = childNodes(node);

    switch (type) {
      case "paragraph": {
        // 单独一行的媒体标签直接作为块级元素，避免被 <p> 包裹
        const onlyChild = children.length === 1 ? childNodes(children[0]) : [];
        if (children.length === 1 && onlyChild.length === 1 && onlyChild[0].type === "text") {
          const media = rawMedia(attr(onlyChild[0], "content"), key);
          if (media) return media;
        }
        const content = renderInline(children, key);
        if (content.every((item) => item === null || item === "")) return null;
        return <p key={key}>{content}</p>;
      }
      case "heading": {
        const level = Number(node.attributes?.level ?? 2);
        const Tag = (level >= 4 ? "h4" : level === 3 ? "h3" : "h2") as
          | "h2"
          | "h3"
          | "h4";
        // 目录锚点按出现顺序编号，与 ArticleGrid 提取规则保持一致
        const id = ctx.withIds ? `article-heading-${ctx.heading}` : undefined;
        if (ctx.withIds) ctx.heading += 1;
        return (
          <Tag key={key} id={id}>
            {renderInline(children, key)}
          </Tag>
        );
      }
      case "blockquote":
        return <blockquote key={key}>{renderBlocks(children, key, ctx)}</blockquote>;
      case "fence":
      case "code-fence": {
        const language = attr(node, "language");
        return (
          <pre key={key}>
            <code className={language ? `language-${language}` : undefined}>
              {attr(node, "content")}
            </code>
          </pre>
        );
      }
      case "list": {
        const ordered = Boolean(node.attributes?.ordered);
        const List = ordered ? "ol" : "ul";
        return <List key={key}>{renderBlocks(children, key, ctx)}</List>;
      }
      case "item":
        return <li key={key}>{renderBlocks(children, key, ctx)}</li>;
      case "hr":
      case "divider":
        return <hr key={key} />;
      case "table":
        // body 有 overflow-x:hidden，宽表格必须套一层横向滚动容器，否则窄屏会被静默裁掉
        return (
          <div key={key} className="article-table-scroll">
            <table>{renderBlocks(children, key, ctx)}</table>
          </div>
        );
      case "thead":
        return <thead key={key}>{renderBlocks(children, key, ctx)}</thead>;
      case "tbody":
        return <tbody key={key}>{renderBlocks(children, key, ctx)}</tbody>;
      case "tr":
        return <tr key={key}>{renderBlocks(children, key, ctx)}</tr>;
      case "th":
        return <th key={key}>{renderBlocks(children, key, ctx)}</th>;
      case "td":
        return <td key={key}>{renderBlocks(children, key, ctx)}</td>;
      case "inline":
        return <p key={key}>{renderInline(children, key)}</p>;
      case "text":
        return attr(node, "content") || null;
      case "image":
        return renderInline([node], key)[0];
      default:
        return children.length > 0 ? (
          <div key={key}>{renderBlocks(children, key, ctx)}</div>
        ) : null;
    }
  });
}

export default function MarkdocContent({
  nodes,
  headingIds = false,
}: {
  nodes: unknown;
  headingIds?: boolean;
}) {
  const list = Array.isArray(nodes) ? (nodes as MarkdocNode[]) : [];
  return <>{renderBlocks(list, "md", { heading: 0, withIds: headingIds })}</>;
}
