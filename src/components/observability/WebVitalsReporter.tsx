"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const payload = JSON.stringify({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
      route: window.location.pathname,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/observability/web-vitals", payload);
      return;
    }

    void fetch("/api/observability/web-vitals", {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    });
  });

  return null;
}
