/**
 * AI 结构化输出的容错解析。
 *
 * 模型常见偏差：包一层 ```json 代码块、前后加解释、字段缺失或偏移量算错。
 * 这里统一清洗；解析失败时明确返回 ok:false，由调用方降级为纯文本展示，
 * 绝不静默把失败当成「没有问题」。
 */

export type ProofreadType = "错别字" | "病句" | "术语不一致" | "标点";

export interface ProofreadIssue {
  id: string;
  quote: string;
  start: number;
  end: number;
  type: ProofreadType;
  suggestion: string;
  reason: string;
  /** start/end 是否可信；不可信时前端禁用「定位」 */
  located: boolean;
}

export interface TagsResult {
  tags: string[];
  description: string;
}

const ISSUE_TYPES: ProofreadType[] = ["错别字", "病句", "术语不一致", "标点"];

function stripFences(raw: string): string {
  return raw
    .replace(/```[a-zA-Z]*/g, "")
    .replace(/```/g, "")
    .trim();
}

function extractRange(raw: string, open: string, close: string): string | null {
  const start = raw.indexOf(open);
  const end = raw.lastIndexOf(close);
  if (start === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

export function parseProofreadResult(
  raw: string,
  source: string
): { ok: true; issues: ProofreadIssue[] } | { ok: false } {
  const text = stripFences(raw);
  const jsonText = extractRange(text, "[", "]");
  if (!jsonText) return { ok: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false };
  }
  if (!Array.isArray(parsed)) return { ok: false };

  const issues: ProofreadIssue[] = [];
  parsed.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const value = item as Record<string, unknown>;
    const quote = typeof value.quote === "string" ? value.quote : "";
    const suggestion = typeof value.suggestion === "string" ? value.suggestion.trim() : "";
    const reason = typeof value.reason === "string" ? value.reason.trim() : "";
    const type: ProofreadType = ISSUE_TYPES.includes(value.type as ProofreadType)
      ? (value.type as ProofreadType)
      : "病句";

    // quote 必须逐字对应原文，首尾空白也算内容，所以不做 trim 后再匹配
    if (!quote.trim() || !suggestion) return;

    let start =
      typeof value.start === "number" && Number.isFinite(value.start)
        ? Math.trunc(value.start)
        : -1;
    let end =
      typeof value.end === "number" && Number.isFinite(value.end) ? Math.trunc(value.end) : -1;

    const offsetTrusted =
      start >= 0 && end > start && end <= source.length && source.slice(start, end) === quote;

    if (!offsetTrusted) {
      // 偏移量不可信时用 quote 反查首个出现位置，仍找不到就标记为未定位
      const found = source.indexOf(quote);
      if (found >= 0) {
        start = found;
        end = found + quote.length;
      } else {
        start = -1;
        end = -1;
      }
    }

    issues.push({
      id: `issue-${index}`,
      quote,
      start,
      end,
      type,
      suggestion,
      reason,
      located: start >= 0,
    });
  });

  // 模型返回了非空数组却一条都不可用，按解析失败处理
  if (parsed.length > 0 && issues.length === 0) return { ok: false };
  return { ok: true, issues };
}

export function parseTagsResult(raw: string): { ok: true; result: TagsResult } | { ok: false } {
  const text = stripFences(raw);
  const jsonText = extractRange(text, "{", "}");
  if (!jsonText) return { ok: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };

  const value = parsed as Record<string, unknown>;
  const tags = Array.isArray(value.tags)
    ? Array.from(
        new Set(
          value.tags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      ).slice(0, 8)
    : [];
  const description = typeof value.description === "string" ? value.description.trim() : "";

  if (!tags.length && !description) return { ok: false };
  return { ok: true, result: { tags, description: description.slice(0, 160) } };
}
