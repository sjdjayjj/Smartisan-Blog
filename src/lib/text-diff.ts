/**
 * 轻量文本 diff：不引入第三方依赖，按 token 做 LCS。
 *
 * 设计取舍：
 * - 中文逐字成 token，英文/数字按连续串成 token，标点与空白单独成 token；
 * - 先剥离公共前后缀，只在中间段做 LCS，避免整篇级别的 O(n*m)；
 * - 中间段超过上限时退化为「整段删除 + 整段新增」，保证永不卡死。
 */

export interface DiffSegment {
  type: "same" | "add" | "remove";
  text: string;
}

const MAX_CELLS = 250_000;

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let latin = "";

  const flush = () => {
    if (latin) {
      tokens.push(latin);
      latin = "";
    }
  };

  for (const char of input) {
    if (/[A-Za-z0-9]/.test(char)) {
      latin += char;
      continue;
    }
    flush();
    tokens.push(char);
  }
  flush();
  return tokens;
}

function push(segments: DiffSegment[], type: DiffSegment["type"], text: string) {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && last.type === type) {
    last.text += text;
    return;
  }
  segments.push({ type, text });
}

function lcsSegments(a: string[], b: string[]): DiffSegment[] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i -= 1) {
    const row = i * width;
    const nextRow = (i + 1) * width;
    for (let j = m - 1; j >= 0; j -= 1) {
      table[row + j] =
        a[i] === b[j]
          ? table[nextRow + j + 1] + 1
          : Math.max(table[nextRow + j], table[row + j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(segments, "same", a[i]);
      i += 1;
      j += 1;
      continue;
    }
    if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      push(segments, "remove", a[i]);
      i += 1;
    } else {
      push(segments, "add", b[j]);
      j += 1;
    }
  }
  while (i < n) {
    push(segments, "remove", a[i]);
    i += 1;
  }
  while (j < m) {
    push(segments, "add", b[j]);
    j += 1;
  }
  return segments;
}

/** 返回按顺序排列的 diff 片段，相邻同类型片段已合并。 */
export function diffText(before: string, after: string): DiffSegment[] {
  if (before === after) return before ? [{ type: "same", text: before }] : [];

  const a = tokenize(before);
  const b = tokenize(after);

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const segments: DiffSegment[] = [];
  push(segments, "same", a.slice(0, head).join(""));

  if (midA.length && midB.length && midA.length * midB.length > MAX_CELLS) {
    push(segments, "remove", midA.join(""));
    push(segments, "add", midB.join(""));
  } else {
    for (const segment of lcsSegments(midA, midB)) push(segments, segment.type, segment.text);
  }

  push(segments, "same", tail ? a.slice(a.length - tail).join("") : "");
  return segments;
}
