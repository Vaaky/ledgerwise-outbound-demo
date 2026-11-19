const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

function baseUrl(): string {
  return (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function apiKey(): string {
  return process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "";
}

function model(): string {
  return process.env.LLM_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
}

export function llmEnabled(): boolean {
  if (process.env.FORCE_MOCK === "1") return false;
  return Boolean(process.env.LLM_BASE_URL || process.env.LLM_API_KEY || process.env.GROQ_API_KEY);
}

export function llmMode(): "live" | "mock" {
  return llmEnabled() ? "live" : "mock";
}

export interface LlmResult<T> {
  data: T | null;
  tokens: number;
  mode: "live" | "mock";
  error?: string;
}

function parseJson<T>(raw: string): T | null {
  let text = raw
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function request(system: string, user: string, jsonMode: boolean, signal: AbortSignal) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = apiKey();
  if (key) headers.authorization = `Bearer ${key}`;

  const sys = process.env.LLM_NO_THINK === "1" ? `${system}\n/no_think` : system;
  const body: Record<string, unknown> = {
    model: model(),
    temperature: Number(process.env.LLM_TEMPERATURE || 0.3),
    max_tokens: Number(process.env.LLM_MAX_TOKENS || 900),
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  return fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * Small JSON-mode wrapper over any OpenAI-compatible endpoint.
 * Works with Groq, llama.cpp, Ollama, vLLM and LM Studio.
 * Every caller has a deterministic fallback, so a quota or timeout never breaks a demo.
 */
export async function llmJson<T>(system: string, user: string): Promise<LlmResult<T>> {
  if (!llmEnabled()) return { data: null, tokens: 0, mode: "mock" };

  const timeout = Number(process.env.LLM_TIMEOUT_MS || 60000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let res = await request(system, user, true, controller.signal);

    // Some local servers reject response_format. Retry once without it.
    if (!res.ok && (res.status === 400 || res.status === 422)) {
      await res.text().catch(() => "");
      res = await request(system, user, false, controller.signal);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        data: null,
        tokens: 0,
        mode: "live",
        error: `LLM ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`,
      };
    }

    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const tokens: number = json?.usage?.total_tokens ?? 0;
    const parsed = parseJson<T>(content);
    if (!parsed) {
      return { data: null, tokens, mode: "live", error: "Model did not return valid JSON" };
    }
    return { data: parsed, tokens, mode: "live" };
  } catch (err: any) {
    const message =
      err?.name === "AbortError" ? `Timed out after ${timeout}ms` : err?.message ?? "llm error";
    return { data: null, tokens: 0, mode: "live", error: message };
  } finally {
    clearTimeout(timer);
  }
}
