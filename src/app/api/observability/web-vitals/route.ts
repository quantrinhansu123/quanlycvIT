import { beginApiObservation, normalizeObservedRoute } from "@/lib/api/observability";
import { apiSuccess } from "@/lib/api/response";

const WEB_VITAL_NAMES = new Set(["TTFB", "FCP", "LCP", "CLS", "INP", "FID"]);

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function shortString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    ? value
    : null;
}

export async function POST(request: Request) {
  beginApiObservation(request);

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiSuccess(null, 202);
    }

    const candidate = body as Record<string, unknown>;
    const name = shortString(candidate.name, 16);
    const value = finiteNumber(candidate.value);
    const route = shortString(candidate.route, 256);

    if (!name || !WEB_VITAL_NAMES.has(name) || value === null || !route?.startsWith("/")) {
      return apiSuccess(null, 202);
    }

    console.info(JSON.stringify({
      event: "web_vital",
      route: normalizeObservedRoute(route),
      name,
      value,
      delta: finiteNumber(candidate.delta),
      rating: shortString(candidate.rating, 24),
      navigationType: shortString(candidate.navigationType, 32),
      metricId: shortString(candidate.id, 128),
    }));
  } catch {
    // Telemetry không hợp lệ không được làm ảnh hưởng trải nghiệm chính.
  }

  return apiSuccess(null, 202);
}
