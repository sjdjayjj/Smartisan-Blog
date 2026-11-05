/**
 * 编辑器 AI 任务的客户端封装：统一走 /api/ai/chat，透传 AbortSignal，
 * 并把服务端的错误码原样抛给调用方，便于区分「超时 / 停止 / 供应商错误」。
 */

export type AiTask = "summary" | "rewrite" | "proofread" | "tags";
export type RewriteStyle = "polish" | "concise" | "expand" | "tone";

export class AiRequestError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AiRequestError";
    this.code = code;
  }
}

export interface StreamAiOptions {
  task: AiTask;
  input: string;
  style?: RewriteStyle;
  signal?: AbortSignal;
  onChunk?: (partial: string) => void;
}

export async function streamAiTask({
  task,
  input,
  style,
  signal,
  onChunk,
}: StreamAiOptions): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, input, ...(style ? { style } : {}) }),
      signal,
    });
  } catch (error) {
    // 主动中断要保持 AbortError，交给调用方判断是「用户停止」还是「请求失败」
    if ((error as { name?: string })?.name === "AbortError") throw error;
    throw new AiRequestError("无法连接服务，请检查网络", "network_error");
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new AiRequestError(data.error ?? "生成失败", data.code ?? `http_${response.status}`);
  }
  if (!response.body) {
    throw new AiRequestError("模型没有返回内容，请重试", "empty_body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      onChunk?.(text);
    }
    text += decoder.decode();
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error;
    throw new AiRequestError("读取生成结果失败，请重试", "stream_broken");
  }

  return text.trim();
}
