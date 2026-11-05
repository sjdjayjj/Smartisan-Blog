import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  AiConfigError,
  aiConfigStorageMode,
  deleteAiConfig,
  readAiConfig,
  readMaskedAiConfig,
  writeAiConfig,
  type AiConfig,
  type AiProvider,
} from "@/lib/ai-config-store";

interface ProviderInput {
  id?: string;
  label?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

interface ConfigInput {
  providers?: ProviderInput[];
  defaultProviderId?: string;
}

const PROVIDER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/;
const MAX_PROVIDERS = 12;
const TEST_TIMEOUT_MS = 15_000;

type TestKind =
  | "success"
  | "unauthorized"
  | "insufficient_balance"
  | "rate_limited"
  | "timeout"
  | "endpoint_not_found"
  | "upstream_error";

interface TestResult {
  ok: boolean;
  kind: TestKind;
  message: string;
  status?: number;
}

function errorResponse(error: unknown) {
  if (error instanceof AiConfigError) {
    const status = error.code === "store_not_ready" ? 503 : 502;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
    // 不向客户端透出内部细节，完整信息留在服务端日志
  console.error("[api/settings/ai]", error);
  return NextResponse.json({ error: "AI 配置存储暂时不可用" }, { status: 500 });
}

function normalizeBaseUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return `${url.origin}${url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")}`;
}

/** 检查文本里是否包含余额/配额类字样，用于把 400/403 细分为余额不足。 */
function looksLikeBalanceIssue(text: string): boolean {
  return /balance|quota|insufficient|credit|余额|额度|欠费/i.test(text);
}

/** 对已保存的供应商发一次最小请求（GET /models），不消耗生成额度。 */
async function testProvider(provider: AiProvider): Promise<TestResult> {
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, kind: "timeout", message: "连接超时，请检查 baseURL 与网络" };
    }
    return {
      ok: false,
      kind: "upstream_error",
      message: "无法连接到供应商，请检查 baseURL",
    };
  }

  if (response.ok) {
    return { ok: true, kind: "success", message: "连接成功", status: response.status };
  }

  const detail = await response.text().catch(() => "");
  if (response.status === 401 || response.status === 403) {
    if (looksLikeBalanceIssue(detail)) {
      return {
        ok: false,
        kind: "insufficient_balance",
        message: "Key 有效但账户余额 / 配额不足",
        status: response.status,
      };
    }
    return { ok: false, kind: "unauthorized", message: "Key 无效或没有访问权限", status: response.status };
  }
  if (response.status === 402) {
    return { ok: false, kind: "insufficient_balance", message: "账户余额不足", status: response.status };
  }
  if (response.status === 429) {
    return { ok: false, kind: "rate_limited", message: "请求过于频繁或配额已用尽", status: response.status };
  }
  if (response.status === 404) {
    return {
      ok: false,
      kind: "endpoint_not_found",
      message: "供应商未提供 /models 接口，可换用带 /v1 的 baseURL 重试",
      status: response.status,
    };
  }
  return {
    ok: false,
    kind: "upstream_error",
    message: `供应商返回异常状态（HTTP ${response.status}）`,
    status: response.status,
  };
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  if (url.searchParams.get("action") === "test") {
    const providerId = url.searchParams.get("provider") ?? "";
    try {
      const config = await readAiConfig();
      if (!config) {
        return NextResponse.json({
          result: { ok: false, kind: "upstream_error", message: "尚未保存任何 AI 供应商配置" },
        });
      }
      const provider = providerId
        ? config.providers.find((item) => item.id === providerId)
        : config.providers.find((item) => item.id === config.defaultProviderId);
      if (!provider) {
        return NextResponse.json({ error: "找不到指定的供应商" }, { status: 404 });
      }
      const result = await testProvider(provider);
      return NextResponse.json({ result });
    } catch (error) {
      return errorResponse(error);
    }
  }

  try {
    const mode = aiConfigStorageMode();
    const config = mode === "none" ? null : await readMaskedAiConfig();
    return NextResponse.json({ ready: mode !== "none", storage: mode, config });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const mode = aiConfigStorageMode();
  if (mode === "none") {
    return NextResponse.json(
      { error: "AI 配置存储未就绪，请先配置 CF_KV_NAMESPACE_ID 与 CF_API_TOKEN", code: "store_not_ready" },
      { status: 503 }
    );
  }

  let payload: ConfigInput;
  try {
    payload = (await request.json()) as ConfigInput;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const inputs = payload.providers;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return NextResponse.json({ error: "至少保留一个供应商" }, { status: 400 });
  }
  if (inputs.length > MAX_PROVIDERS) {
    return NextResponse.json({ error: `供应商数量上限为 ${MAX_PROVIDERS}` }, { status: 400 });
  }

  try {
    const existing = await readAiConfig();
    const seen = new Set<string>();
    const providers: AiProvider[] = [];

    for (const [index, item] of inputs.entries()) {
      if (!item || typeof item !== "object") {
        return NextResponse.json({ error: `第 ${index + 1} 个供应商格式不正确` }, { status: 400 });
      }
      const id = (item.id ?? "").trim();
      if (!PROVIDER_ID_RE.test(id)) {
        return NextResponse.json(
          { error: `第 ${index + 1} 个供应商 ID 只能包含字母、数字、下划线与短横线` },
          { status: 400 }
        );
      }
      if (seen.has(id)) {
        return NextResponse.json({ error: `供应商 ID 重复：${id}` }, { status: 400 });
      }
      seen.add(id);

      const baseUrl = normalizeBaseUrl((item.baseUrl ?? "").trim());
      if (!baseUrl) {
        return NextResponse.json(
          { error: `供应商「${id}」的 baseURL 必须是合法的 https 地址` },
          { status: 400 }
        );
      }

      const model = (item.model ?? "").trim();
      if (!model) {
        return NextResponse.json({ error: `供应商「${id}」必须填写模型名` }, { status: 400 });
      }

      // 空 Key 表示沿用旧值，避免每次保存都要重新粘贴掩码背后的明文
      const incomingKey = (item.apiKey ?? "").trim();
      const oldKey = existing?.providers.find((provider) => provider.id === id)?.apiKey ?? "";
      const apiKey = incomingKey || oldKey;
      if (!apiKey) {
        return NextResponse.json({ error: `供应商「${id}」必须填写 Key` }, { status: 400 });
      }

      providers.push({
        id,
        label: (item.label ?? "").trim().slice(0, 40) || id,
        baseUrl,
        model,
        apiKey,
      });
    }

    const requestedDefault = (payload.defaultProviderId ?? "").trim();
    const defaultProviderId = providers.some((provider) => provider.id === requestedDefault)
      ? requestedDefault
      : providers[0].id;

    const config: AiConfig = {
      version: 1,
      providers,
      defaultProviderId,
      updatedAt: new Date().toISOString(),
    };

    await writeAiConfig(config);
    return NextResponse.json({ ok: true, config: await readMaskedAiConfig() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  if (aiConfigStorageMode() === "none") {
    return NextResponse.json({ error: "AI 配置存储未就绪", code: "store_not_ready" }, { status: 503 });
  }

  try {
    await deleteAiConfig();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
