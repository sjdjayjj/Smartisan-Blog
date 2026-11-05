import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { AiConfigError, readAiConfig, type AiProvider } from "@/lib/ai-config-store";

interface ChatPayload {
  task?: string;
  style?: string;
  providerId?: string;
  input?: string;
  system?: string;
  maxTokens?: number;
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

const INPUT_LIMIT = 8_000;
const SYSTEM_LIMIT = 2_000;
const DEFAULT_MAX_TOKENS = 800;
const MAX_TOKENS_LIMIT = 2_048;
const UPSTREAM_TIMEOUT_MS = 90_000;

const TASKS = ["summary", "rewrite", "proofread", "tags"] as const;
type AiTask = (typeof TASKS)[number];

const REWRITE_STYLES = {
  polish: "润色：保持原意与全部信息量，提升用词准确度、句子节奏与衔接。",
  concise: "精简：删去冗余、重复与空话，保留关键信息，篇幅明显缩短。",
  expand: "扩写：不虚构事实，补充细节、例子与因果逻辑，篇幅约为原文的 1.5 至 2 倍。",
  tone: "换语气：改为克制、书面、平实的叙述语气，避免口语与感叹。",
} as const;
type RewriteStyle = keyof typeof REWRITE_STYLES;

const NO_EXTRA_RULE = "只输出处理后的正文，不要解释过程，不要加引号、前缀或 Markdown 标记。";

const PROMPTS = {
  summary:
    "你是中文博客编辑。请为给定文章正文生成一段 60-90 字的摘要，只输出摘要正文，不要加引号、前缀或解释。",
  proofread: [
    "你是中文文字校对。只检查四类问题：错别字、病句、术语不一致、标点。",
    "只输出一个 JSON 数组，不要输出解释、前缀、代码块标记或多余文字。",
    "数组每一项的字段：",
    'quote：原文中的片段，必须逐字复制，不要改写、不要补全；',
    "start：片段在原文中的起始字符位置，从 0 开始计数，中文每字算 1；",
    "end：片段结束位置，不含 end 本身；",
    'type：只能是 "错别字"、"病句"、"术语不一致"、"标点" 之一；',
    "suggestion：建议替换成的片段，只替换 quote 范围内的文字；",
    "reason：一句话说明修改理由。",
    "没有发现问题时输出 []。最多输出 30 条，优先列出影响理解或明显错误的问题。",
    "不要重写全文，不要输出整段文章。",
  ].join("\n"),
  tags: [
    "你是中文博客编辑。请根据文章正文生成标签建议与 SEO 描述。",
    "只输出一个 JSON 对象，不要解释，不要代码块标记：",
    '{"tags":["标签1","标签2","标签3","标签4","标签5"],"description":"不超过 110 字的 SEO 描述"}',
    "标签用 2 到 6 个中文字，覆盖主题、领域与关键概念，不要照抄标题词；描述要概括全文价值，不使用感叹号。",
  ].join("\n"),
  rewriteBase: "你是中文写作助手。请按要求改写用户给出的片段。",
};

const TASK_MAX_TOKENS: Record<AiTask, number> = {
  summary: 400,
  rewrite: 1_200,
  proofread: 2_048,
  tags: 600,
};

function errorResponse(status: number, error: string, code: string) {
  return NextResponse.json({ error, code }, { status });
}

function looksLikeBalanceIssue(text: string): boolean {
  return /balance|quota|insufficient|credit|余额|额度|欠费/i.test(text);
}

/** 把上游状态码翻译成前端可区分的错误。 */
function mapUpstreamError(status: number, detail: string) {
  if (status === 401 || (status === 403 && !looksLikeBalanceIssue(detail))) {
    return errorResponse(502, "供应商拒绝了这把 Key，请到 AI 设置里检查", "unauthorized");
  }
  if (status === 402 || looksLikeBalanceIssue(detail)) {
    return errorResponse(502, "供应商账户余额或配额不足", "insufficient_balance");
  }
  if (status === 429) {
    return errorResponse(502, "供应商限流或配额已用尽，请稍后重试", "rate_limited");
  }
  return errorResponse(502, `供应商返回异常状态（HTTP ${status}）`, "upstream_error");
}

function logUsage(
  provider: AiProvider,
  task: AiTask | null,
  usage: Usage | null,
  startedAt: number,
  outcome: string
) {
  const prompt = usage?.prompt_tokens ?? "?";
  const completion = usage?.completion_tokens ?? "?";
  const total = usage?.total_tokens ?? "?";
  console.info(
    `[ai/chat] task=${task ?? "generic"} provider=${provider.id} model=${provider.model} ` +
      `outcome=${outcome} prompt=${prompt} completion=${completion} total=${total} ` +
      `duration=${Date.now() - startedAt}ms`
  );
}

function extractEventData(event: string): string | null {
  const lines = event.split("\n");
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  return data || null;
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let payload: ChatPayload;
  try {
    payload = (await request.json()) as ChatPayload;
  } catch {
    return errorResponse(400, "请求格式错误", "bad_request");
  }

  const taskRaw = (payload.task ?? "").trim();
  let task: AiTask | null = null;
  if (taskRaw) {
    if (!TASKS.includes(taskRaw as AiTask)) {
      return errorResponse(400, `不支持的任务类型：${taskRaw}`, "bad_task");
    }
    task = taskRaw as AiTask;
  }

  let style: RewriteStyle = "polish";
  if (task === "rewrite") {
    const styleRaw = (payload.style ?? "polish").trim();
    if (!Object.prototype.hasOwnProperty.call(REWRITE_STYLES, styleRaw)) {
      return errorResponse(400, `不支持的改写风格：${styleRaw}`, "bad_style");
    }
    style = styleRaw as RewriteStyle;
  }

  const input = payload.input ?? "";
  if (!input.trim()) return errorResponse(400, "输入内容不能为空", "empty_input");
  if (input.length > INPUT_LIMIT) {
    return errorResponse(
      400,
      `输入共 ${input.length} 字，超过 ${INPUT_LIMIT} 字上限，请先精简正文`,
      "input_too_long"
    );
  }

  let system = "";
  let maxTokens = payload.maxTokens ?? DEFAULT_MAX_TOKENS;

  if (task) {
    // 任务型请求由服务端锁定 prompt 与 max_tokens，避免客户端传参与输出格式冲突
    system =
      task === "rewrite"
        ? `${PROMPTS.rewriteBase}${REWRITE_STYLES[style]}${NO_EXTRA_RULE}`
        : PROMPTS[task];
    maxTokens = TASK_MAX_TOKENS[task];
  } else {
    system = (payload.system ?? "").trim();
    if (system.length > SYSTEM_LIMIT) {
      return errorResponse(400, `system 提示词超过 ${SYSTEM_LIMIT} 字上限`, "system_too_long");
    }
    if (!Number.isInteger(maxTokens) || maxTokens <= 0 || maxTokens > MAX_TOKENS_LIMIT) {
      return errorResponse(
        400,
        `max_tokens 必须是 1 ~ ${MAX_TOKENS_LIMIT} 之间的整数`,
        "max_tokens_invalid"
      );
    }
  }

  let config;
  try {
    config = await readAiConfig();
  } catch (error) {
    if (error instanceof AiConfigError) {
      const status = error.code === "store_not_ready" ? 503 : 502;
      return errorResponse(status, error.message, error.code);
    }
    console.error("[ai/chat] read-config", error);
    return errorResponse(500, "AI 配置读取失败", "config_read_failed");
  }
  if (!config) {
    return errorResponse(503, "尚未配置 AI 供应商，请先到 AI 设置里添加", "ai_not_configured");
  }

  // 显式指定的供应商找不到时必须报错，不能静默回落到默认供应商（否则会拿错误的 Key 计费）
  const requestedProviderId = (payload.providerId ?? "").trim();
  const provider = requestedProviderId
    ? config.providers.find((item) => item.id === requestedProviderId)
    : config.providers.find((item) => item.id === config.defaultProviderId);
  if (!provider) {
    return errorResponse(400, "指定的供应商不存在", "provider_not_found");
  }

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: input });

  // 客户端中断与超时都通过同一个 controller 透传到上游 fetch / SSE 读取
  const upstreamController = new AbortController();
  let timedOut = false;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    upstreamController.abort();
  }, UPSTREAM_TIMEOUT_MS);
  const onClientAbort = () => upstreamController.abort();

  if (request.signal.aborted) {
    upstreamController.abort();
  } else {
    request.signal.addEventListener("abort", onClientAbort);
  }

  const releaseAbort = () => {
    clearTimeout(timeoutTimer);
    request.signal.removeEventListener("abort", onClientAbort);
  };

  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
      cache: "no-store",
      signal: upstreamController.signal,
    });
  } catch (error) {
    releaseAbort();
    if (timedOut) return errorResponse(504, "模型响应超时，请稍后重试", "timeout");
    if (request.signal.aborted) return errorResponse(499, "请求已取消", "client_aborted");
    const name = (error as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return errorResponse(504, "模型响应超时，请稍后重试", "timeout");
    }
    console.error("[ai/chat] fetch", error);
    return errorResponse(502, "无法连接到供应商，请检查 baseURL 与网络", "upstream_error");
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    releaseAbort();
    return mapUpstreamError(upstream.status, detail);
  }

  const contentType = upstream.headers.get("content-type") ?? "";

  // 少数供应商忽略 stream 参数，直接回一整段 JSON
  if (!contentType.includes("text/event-stream")) {
    let text = "";
    let usage: Usage | null = null;
    try {
      const data = (await upstream.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: Usage;
      };
      text = data.choices?.[0]?.message?.content ?? "";
      usage = data.usage ?? null;
    } catch {
      releaseAbort();
      return errorResponse(502, "无法解析供应商返回内容", "upstream_error");
    }
    releaseAbort();
    logUsage(provider, task, usage, startedAt, "json");
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  if (!upstream.body) {
    releaseAbort();
    return errorResponse(502, "供应商未返回可读取的数据流", "upstream_error");
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let usage: Usage | null = null;
  let outcome = "stream";
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE 事件以空行分隔；最后一段可能不完整，留到下一轮
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const data = extractEventData(event);
            if (!data || data === "[DONE]") continue;
            let json: {
              choices?: Array<{ delta?: { content?: string }; usage?: Usage }>;
              usage?: Usage;
            };
            try {
              json = JSON.parse(data);
            } catch {
              continue;
            }
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              controller.enqueue(encoder.encode(delta));
            }
            const chunkUsage = json.usage ?? json.choices?.[0]?.usage;
            if (chunkUsage) usage = chunkUsage;
          }
        }
        controller.close();
      } catch (error) {
        outcome = timedOut ? "timeout" : "aborted";
        controller.error(error);
      } finally {
        releaseAbort();
        logUsage(provider, task, usage, startedAt, outcome);
      }
    },
    cancel() {
      outcome = "client_cancelled";
      upstreamController.abort();
      void reader?.cancel();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
