import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

type TimingStage = "auth" | "db" | "map";

interface ApiObservation {
  requestId: string;
  method: string;
  route: string;
  startedAt: number;
  timings: Record<TimingStage, number>;
  finalized: boolean;
}

const apiObservations = new AsyncLocalStorage<ApiObservation>();
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function now(): number {
  return performance.now();
}

/** Gom route động theo mẫu, tránh đưa id bản ghi vào log/metric. */
export function normalizeObservedRoute(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      if (UUID_SEGMENT.test(segment)) return ":id";
      if (/^\d+$/.test(segment)) return ":number";
      return segment.length > 64 ? ":segment" : segment;
    })
    .join("/");
}

/** Khởi tạo context đo cho request hiện tại; gọi lặp trong cùng handler là no-op. */
export function beginApiObservation(request: Request): void {
  if (apiObservations.getStore()) return;
  let route = "/api/unknown";
  try {
    route = normalizeObservedRoute(new URL(request.url).pathname);
  } catch {
    // Chỉ log pathname mặc định, tuyệt đối không log URL/query không hợp lệ.
  }
  apiObservations.enterWith({
    requestId: crypto.randomUUID(),
    method: request.method.toUpperCase(),
    route,
    startedAt: now(),
    timings: { auth: 0, db: 0, map: 0 },
    finalized: false,
  });
}

export async function measureApiTiming<T>(
  stage: TimingStage,
  operation: () => Promise<T>
): Promise<T> {
  const observation = apiObservations.getStore();
  if (!observation) return operation();
  const startedAt = now();
  try {
    return await operation();
  } finally {
    observation.timings[stage] += now() - startedAt;
  }
}

export function measureApiTimingSync<T>(stage: TimingStage, operation: () => T): T {
  const observation = apiObservations.getStore();
  if (!observation) return operation();
  const startedAt = now();
  try {
    return operation();
  } finally {
    observation.timings[stage] += now() - startedAt;
  }
}

/** Fetch dùng cho Supabase/PostgREST; tự cộng toàn bộ network time vào stage db. */
export function observedDatabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return measureApiTiming("db", () => fetch(input, init));
}

function metric(name: string, duration: number): string {
  return `${name};dur=${duration.toFixed(1)}`;
}

export function finalizeApiObservation(params: {
  response: Response;
  status: number;
  rows: number;
  responseBytes: number;
}): Response {
  const observation = apiObservations.getStore();
  if (!observation) {
    params.response.headers.set("x-request-id", crypto.randomUUID());
    return params.response;
  }

  const total = now() - observation.startedAt;
  params.response.headers.set("x-request-id", observation.requestId);
  params.response.headers.set(
    "Server-Timing",
    [
      metric("auth", observation.timings.auth),
      metric("db", observation.timings.db),
      metric("map", observation.timings.map),
      metric("total", total),
    ].join(", ")
  );

  if (!observation.finalized) {
    observation.finalized = true;
    console.info(JSON.stringify({
      event: "api_response",
      route: observation.route,
      method: observation.method,
      status: params.status,
      durationMs: Math.round(total * 10) / 10,
      authMs: Math.round(observation.timings.auth * 10) / 10,
      dbMs: Math.round(observation.timings.db * 10) / 10,
      mapMs: Math.round(observation.timings.map * 10) / 10,
      rows: params.rows,
      responseBytes: params.responseBytes,
      requestId: observation.requestId,
    }));
  }
  return params.response;
}
