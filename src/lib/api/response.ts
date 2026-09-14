import { NextResponse } from "next/server";
import {
  beginApiObservation,
  finalizeApiObservation,
  measureApiTimingSync,
} from "@/lib/api/observability";

export class ApiException extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiException";
    this.status = status;
  }
}

interface DatabaseError {
  code?: string;
  message?: string;
}

function rowCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object" && "items" in data) {
    const items = (data as { items?: unknown }).items;
    return Array.isArray(items) ? items.length : 1;
  }
  return data === null || data === undefined ? 0 : 1;
}

function jsonResponse(body: unknown, status: number, rows: number): NextResponse {
  const serialized = measureApiTimingSync("map", () => JSON.stringify(body));
  const response = new NextResponse(serialized, {
    status,
    headers: { "Content-Type": "application/json" },
  });
  return finalizeApiObservation({
    response,
    status,
    rows,
    responseBytes: new TextEncoder().encode(serialized).byteLength,
  }) as NextResponse;
}

export function apiSuccess<T>(data: T, status = 200, message?: string) {
  return jsonResponse({
    success: true,
    ...(message ? { message } : {}),
    data,
  }, status, rowCount(data));
}

export function apiError(message: string, status: number) {
  return jsonResponse({ success: false, message, data: null }, status, 0);
}

export function throwDatabaseError(error: DatabaseError | null): void {
  if (!error) return;

  if (error.code === "23505") {
    throw new ApiException("Dữ liệu bị trùng với bản ghi đã tồn tại.", 409);
  }
  if (error.code === "23503") {
    throw new ApiException("Dữ liệu liên kết không tồn tại hoặc đang được sử dụng.", 400);
  }
  if (error.code === "23514" || error.code === "22P02") {
    throw new ApiException("Dữ liệu không đúng định dạng hoặc không thỏa điều kiện.", 400);
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    throw new ApiException("Bạn không có quyền thực hiện thao tác này.", 403);
  }

  console.error("Supabase error:", error.code, error.message);
  throw new ApiException("Không thể xử lý dữ liệu trên Supabase.", 500);
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiException) {
    return apiError(error.message, error.status);
  }

  console.error("API error:", error);
  return apiError("Đã xảy ra lỗi không mong muốn.", 500);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  beginApiObservation(request);
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiException("Nội dung yêu cầu phải là một JSON object.", 400);
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiException) throw error;
    throw new ApiException("JSON gửi lên không hợp lệ.", 400);
  }
}
