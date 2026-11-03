/**
 * 从 Markdoc AST 提取文章标题，供弹窗与独立页的目录共用。
 * 编号规则必须与 MarkdocContent 的 `article-heading-N` 完全一致：
 * 按文档顺序对 heading 节点计数，而不是按层级计数。
 */

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

type DocNode = {
  type?: string;
  attributes?: Record<string, unknown>;
  children?: DocNode[];
};

export function collectHeadings(nodes: unknown): HeadingItem[] {
  const list = Array.isArray(nodes) ? (nodes as DocNode[]) : [];
  const headings: HeadingItem[] = [];

  const textOf = (node: DocNode): string => {
    const type = node.type ?? "";
    if (type === "text" || type === "code") {
      const content = node.attributes?.content;
      return typeof content === "string" ? content : "";
    }
    if (type === "softbreak" || type === "hardbreak") return " ";
    return (node.children ?? []).map(textOf).join("");
  };

  const walk = (items: DocNode[]) => {
    for (const node of items) {
      if (node.type === "heading") {
        const level = Number(node.attributes?.level ?? 2);
        headings.push({
          id: `article-heading-${headings.length}`,
          level: level >= 4 ? 4 : level === 3 ? 3 : 2,
          text: (node.children ?? []).map(textOf).join("").trim(),
        });
        continue;
      }
      if (node.children?.length) walk(node.children);
    }
  };

  walk(list);
  return headings.filter((heading) => heading.text.length > 0);
}
