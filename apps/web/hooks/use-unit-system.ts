"use client";

import { useCallback, useEffect, useState } from "react";
import type { UnitSystem } from "@/lib/units";

const KEY = "meridian.unit-system.v1";
const EVENT = "meridian:unit-system-change";

export function useUnitSystem(): [UnitSystem, (system: UnitSystem) => void] {
  const [system, setSystem] = useState<UnitSystem>("metric");
  useEffect(() => {
    const sync = (event?: Event) => {
      if (event instanceof CustomEvent && (event.detail === "metric" || event.detail === "us")) {
        setSystem(event.detail);
        return;
      }
      try {
        const saved = localStorage.getItem(KEY);
        setSystem(saved === "us" ? "us" : "metric");
      } catch { setSystem("metric"); }
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const choose = useCallback((next: UnitSystem) => {
    setSystem(next);
    try { localStorage.setItem(KEY, next); } catch { /* Session preference still applies. */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);
  return [system, choose];
}
