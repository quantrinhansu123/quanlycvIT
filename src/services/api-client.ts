import type { ApiResponse } from "@/types/project";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = options;

  // Với FormData, trình duyệt tự đặt Content-Type kèm boundary.
  const isFormData = rest.body instanceof FormData;
  const finalHeaders: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(await sessionHeaders()),
    ...headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
  });

  if (!response.ok) {
    let message = `Yêu cầu thất bại với mã lỗi ${response.status}`;
    try {
      const body = (await response.json()) as ApiResponse<unknown>;
      if (body?.message) message = body.message;
    } catch {
      // response không có JSON body hợp lệ, giữ message mặc định
    }
    throw new ApiError(message, response.status);
  }

  const json = (await response.json()) as ApiResponse<T>;
  return json.data;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: "POST", body: JSON.stringify(body) }),
  postFormData: <T>(path: string, body: FormData, options?: RequestInit) =>
    request<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: "DELETE" }),
};
