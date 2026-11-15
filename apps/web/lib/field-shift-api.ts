import type {
  AnalysisExampleResult,
  AnalyzePayload,
  AnalyzeResult,
  ApiErrorResult,
  OptionsResult,
  ReadyResult,
} from "@spaceapps/shared";

export type { AnalyzePayload, AnalyzeResult, OptionsResult, ReadyResult, AnalysisExampleResult };

export class FieldShiftApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId: string | null,
    public readonly details: ApiErrorResult["error"]["details"] = [],
  ) {
    super(message);
    this.name = "FieldShiftApiError";
  }
}

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

async function request<T>(path: string, payload?: unknown, signal?: AbortSignal, acceptedStatuses: readonly number[] = []): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 20_000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: payload === undefined ? "GET" : "POST",
      headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const body: unknown = await response.json();
    if (!response.ok && !acceptedStatuses.includes(response.status)) {
      const error = (body && typeof body === "object" ? body : {}) as Partial<ApiErrorResult>;
      throw new FieldShiftApiError(response.status, error.error?.code ?? "http_error",
        error.error?.message ?? `API returned ${response.status}`,
        response.headers.get("X-Request-ID") ?? error.request_id ?? null, error.error?.details ?? []);
    }
    return body as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export const getOptions = (signal?: AbortSignal) => request<OptionsResult>("/api/v1/options", undefined, signal);
export const getReady = (signal?: AbortSignal) => request<ReadyResult>("/ready", undefined, signal, [503]);
export const analyzeCoverCrop = (payload: AnalyzePayload, signal?: AbortSignal) => request<AnalyzeResult>("/api/v1/analyze", payload, signal);
export const getAnalysisExample = (signal?: AbortSignal) => request<AnalysisExampleResult>("/api/v1/examples/analysis", undefined, signal);
