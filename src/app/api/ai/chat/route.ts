import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { AiConfigError, readAiConfig, type AiProvider } from "@/lib/ai-config-store";

interface ChatPayload {
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
  usage: Usage | null,
  startedAt: number,
  outcome: string
) {
  const prompt = usage?.prompt_tokens ?? "?";
  const completion = usage?.completion_tokens ?? "?";
  const total = usage?.total_tokens ?? "?";
  console.info(
    `[ai/chat] provider=${provider.id} model=${provider.model} outcome=${outcome} ` +
      `prompt=${prompt} completion=${completion} total=${total} duration=${Date.now() - startedAt}ms`
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

  const input = payload.input ?? "";
  if (!input.trim()) return errorResponse(400, "输入内容不能为空", "empty_input");
  if (input.length > INPUT_LIMIT) {
    return errorResponse(
      400,
      `输入共 ${input.length} 字，超过 ${INPUT_LIMIT} 字上限，请先精简正文`,
      "input_too_long"
    );
  }

  const system = (payload.system ?? "").trim();
  if (system.length > SYSTEM_LIMIT) {
    return errorResponse(400, `system 提示词超过 ${SYSTEM_LIMIT} 字上限`, "system_too_long");
  }

  const maxTokens = payload.maxTokens ?? DEFAULT_MAX_TOKENS;
  if (!Number.isInteger(maxTokens) || maxTokens <= 0 || maxTokens > MAX_TOKENS_LIMIT) {
    return errorResponse(
      400,
      `max_tokens 必须是 1 ~ ${MAX_TOKENS_LIMIT} 之间的整数`,
      "max_tokens_invalid"
    );
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
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return errorResponse(504, "模型响应超时，请稍后重试", "timeout");
    }
    console.error("[ai/chat] fetch", error);
    return errorResponse(502, "无法连接到供应商，请检查 baseURL 与网络", "upstream_error");
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
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
      return errorResponse(502, "无法解析供应商返回内容", "upstream_error");
    }
    logUsage(provider, usage, startedAt, "json");
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  if (!upstream.body) {
    return errorResponse(502, "供应商未返回可读取的数据流", "upstream_error");
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let usage: Usage | null = null;
  let outcome = "stream";

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
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
        outcome = "aborted";
        controller.error(error);
      } finally {
        logUsage(provider, usage, startedAt, outcome);
      }
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
