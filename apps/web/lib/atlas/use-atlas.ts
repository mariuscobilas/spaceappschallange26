"use client";
import { useEffect, useState } from "react";
import type { AtlasDataset } from "@spaceapps/shared";
import { unavailableAtlas, validateAtlas } from "./data";
export function useAtlas(enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ attempt: number; data: AtlasDataset }>();
  useEffect(() => {
    if (!enabled || state?.attempt === attempt) return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
    void fetch(`${base}/api/v1/atlas`, { signal: controller.signal }).then(async response => {
      if (Number(response.headers.get("content-length")) > 10 * 1024 * 1024) throw Error("Regional dataset exceeds size limit.");
      const raw = await response.text();
      if (raw.length > 10 * 1024 * 1024) throw Error("Regional dataset exceeds size limit.");
      const value: unknown = JSON.parse(raw);
      if ((!response.ok && !(value && typeof value === "object" && (value as AtlasDataset).status === "unavailable")) || !validateAtlas(value)) throw Error("Regional dataset did not pass contract and provenance checks.");
      return value;
    }).catch(() => unavailableAtlas("A validated regional dataset is not available. The geographic map and point observations remain usable.")).then(data => { if (!disposed) setState({ attempt, data }); }).finally(() => window.clearTimeout(timeout));
    return () => { disposed = true; controller.abort(); window.clearTimeout(timeout); };
  }, [enabled, attempt, state?.attempt]);
  return { data: state?.attempt === attempt ? state.data : undefined, loading: enabled && state?.attempt !== attempt, retry: () => setAttempt(n => n + 1) };
}
