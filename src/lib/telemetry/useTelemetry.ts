import { useEffect, useState } from "react";
import { engine } from "./engine";
import { useSettings } from "./settings";
import type { TelemetrySnapshot } from "./types";

/**
 * Rendering is decoupled from packet rate: the engine ticks at 20 Hz,
 * the UI samples the state store at the user's chosen refresh rate.
 */
export function useTelemetry(renderHzOverride?: number): TelemetrySnapshot {
  const settings = useSettings();
  const renderHz = renderHzOverride ?? settings.renderHz;
  const [snap, setSnap] = useState<TelemetrySnapshot>(() => engine.snapshot());


  useEffect(() => {
    let dirty = false;
    const unsub = engine.subscribe(() => {
      dirty = true;
    });
    const timer = setInterval(() => {
      if (!dirty) return;
      dirty = false;
      setSnap(engine.snapshot());
    }, 1000 / renderHz);
    setSnap(engine.snapshot());
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [renderHz]);

  return snap;
}
