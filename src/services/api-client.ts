import type { ApiResponse } from "@/types/project";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

/** Nhóm lỗi để UI hiển thị đúng thông điệp thay vì luôn báo chung chung. */
export type ApiErrorKind = "timeout" | "network" | "auth" | "validation" | "server" | "unknown";

export class ApiError extends Error {
  status: number;
  kind: ApiErrorKind;

  constructor(message: string, status: number, kind: ApiErrorKind = "unknown") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
  }
}

export interface ApiRequestOptions extends RequestInit {
  /** Ghi đè timeout mặc định theo phương thức (ms). */
  timeoutMs?: number;
}

// GET/HEAD tải danh sách nên timeout ngắn hơn mutation; upload cần nhiều thời gian nhất.
const LIST_TIMEOUT_MS = 15_000;
const MUTATION_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 30_000;

const RETRY_BACKOFF_MS = [300, 800];
const MAX_RETRIES = RETRY_BACKOFF_MS.length;

const PAYLOAD_BUDGET_BYTES = {
  accounts: 80 * 1024,
  projects: 100 * 1024,
  tasks: 120 * 1024,
  subtasks: 120 * 1024,
  users: 40 * 1024,
  directory: 60 * 1024,
} as const;

function safePath(path: string): string {
  return `${API_BASE_URL}${path}`.split("?", 1)[0];
}

function payloadBudget(path: string): number | undefined {
  if (path.includes("directory=true") || path.startsWith("/users")) return PAYLOAD_BUDGET_BYTES.directory;
  const resource = path.split("?", 1)[0].split("/").filter(Boolean)[0] as keyof typeof PAYLOAD_BUDGET_BYTES | undefined;
  return resource ? PAYLOAD_BUDGET_BYTES[resource] : undefined;
}

function logResponse(details: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  payloadBytes: number;
  requestId: string | null;
  attempt: number;
}): void {
  const budgetBytes = payloadBudget(details.path);
  const record = {
    event: "api_client_response",
    method: details.method,
    route: safePath(details.path),
    status: details.status,
    durationMs: Math.round(details.durationMs),
    payloadBytes: details.payloadBytes,
    requestId: details.requestId,
    attempt: details.attempt,
    ...(budgetBytes ? { budgetBytes, overBudget: details.payloadBytes > budgetBytes } : {}),
  };
  if (budgetBytes && details.payloadBytes > budgetBytes) console.warn(JSON.stringify(record));
  else if (process.env.NODE_ENV === "development") console.info(JSON.stringify(record));
}

function isRetryableMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function classifyStatus(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 408) return "timeout";
  if (status >= 500) return "server";
  if (status >= 400) return "validation";
  return "unknown";
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterDelay(baseMs: number): number {
  return baseMs + Math.random() * 100;
}

/** Tab đã ẩn/đóng thì không còn ý nghĩa để retry — tránh giữ request treo vô ích. */
function isPageHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** Gộp signal của caller (nếu có) với signal timeout nội bộ thành một signal duy nhất cho `fetch`. */
function combineSignals(callerSignal: AbortSignal | undefined, timeoutSignal: AbortSignal): AbortSignal {
  if (!callerSignal) return timeoutSignal;
  const controller = new AbortController();
  if (callerSignal.aborted || timeoutSignal.aborted) {
    controller.abort();
  } else {
    const onAbort = () => controller.abort();
    callerSignal.addEventListener("abort", onAbort, { once: true });
    timeoutSignal.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

async function sessionHeaders(): Promise<HeadersInit> {
  if (typeof window === "undefined") return {};

  const {
    data: { session },
  } = await createBrowserSupabaseClient().auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

async function buildResponseError(response: Response): Promise<ApiError> {
  let message = `Yêu cầu thất bại với mã lỗi ${response.status}`;
  try {
    const body = (await response.json()) as ApiResponse<unknown>;
    if (body?.message) message = body.message;
  } catch {
    // response không có JSON body hợp lệ, giữ message mặc định
  }
  return new ApiError(message, response.status, classifyStatus(response.status));
}

/** Một lần gọi `fetch` có timeout riêng; phân biệt được abort do caller hay do hết giờ. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined
): Promise<Response> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: combineSignals(callerSignal, timeoutController.signal) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      // Caller (component) hủy request — giữ nguyên AbortError để nơi gọi tự bỏ qua, không toast.
      if (callerSignal?.aborted) throw error;
      throw new ApiError("Yêu cầu quá thời gian chờ. Vui lòng thử lại.", 0, "timeout");
    }
    // fetch chỉ ném lỗi khác AbortError khi có sự cố mạng (mất kết nối, DNS, CORS...).
    throw new ApiError("Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.", 0, "network");
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { headers, timeoutMs, signal, ...rest } = options;
  const callerSignal = signal ?? undefined;
  const method = (rest.method ?? "GET").toUpperCase();

  // Với FormData, trình duyệt tự đặt Content-Type kèm boundary.
  const isFormData = rest.body instanceof FormData;
  const finalHeaders: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(await sessionHeaders()),
    ...headers,
  };

  const effectiveTimeout =
    timeoutMs ?? (isFormData ? UPLOAD_TIMEOUT_MS : isRetryableMethod(method) ? LIST_TIMEOUT_MS : MUTATION_TIMEOUT_MS);
  const canRetry = isRetryableMethod(method);
  const url = `${API_BASE_URL}${path}`;

  for (let attempt = 0; ; attempt++) {
    if (callerSignal?.aborted) {
      throw new DOMException("Đã hủy yêu cầu.", "AbortError");
    }

    let response: Response;
    const startedAt = performance.now();
    try {
      response = await fetchWithTimeout(url, { ...rest, headers: finalHeaders }, effectiveTimeout, callerSignal);
    } catch (error) {
      const isCallerAbort = error instanceof DOMException && error.name === "AbortError" && callerSignal?.aborted;
      if (isCallerAbort || !canRetry || attempt >= MAX_RETRIES || isPageHidden()) throw error;
      await sleep(jitterDelay(RETRY_BACKOFF_MS[attempt]));
      continue;
    }

    if (response.ok) {
      const body = await response.text();
      logResponse({
        method,
        path,
        status: response.status,
        durationMs: performance.now() - startedAt,
        payloadBytes: new TextEncoder().encode(body).byteLength,
        requestId: response.headers.get("x-request-id"),
        attempt: attempt + 1,
      });
      const json = JSON.parse(body) as ApiResponse<T>;
      return json.data;
    }

    if (canRetry && isRetryableStatus(response.status) && attempt < MAX_RETRIES && !isPageHidden()) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
      await sleep(retryAfterMs ?? jitterDelay(RETRY_BACKOFF_MS[attempt]));
      continue;
    }

    throw await buildResponseError(response);
  }
}

export const apiClient = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    // Các endpoint ứng dụng phụ thuộc phiên đăng nhập và dữ liệu thay đổi thường xuyên.
    // Không dùng HTTP cache để tránh trả dữ liệu/quyền truy cập cũ cho người dùng.
    request<T>(path, { ...options, method: "GET", cache: "no-store" }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "POST", body: JSON.stringify(body) }),
  postFormData: <T>(path: string, body: FormData, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};
