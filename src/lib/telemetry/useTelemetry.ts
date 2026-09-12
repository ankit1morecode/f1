import { useEffect, useState } from "react";
import { engine } from "./engine";
import { frameSource } from "./frameSource";
import { useSettings } from "./settings";
import type { TelemetryMetaPayload } from "./frames";
import type { TelemetrySnapshot } from "./types";

/**
 * Rendering is decoupled from the sample rate: the engine ticks at the data's
 * own rate (24 Hz for the supplied dataset, 20 Hz for the behavioural model),
 * and the UI samples the state store at the user's chosen refresh rate.
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

/**
 * Track metadata for the supplied circuit — outline, turns and per-lap rollups,
 * fetched once from MongoDB and shared by every screen that needs it.
 */
export function useTrackData(): TelemetryMetaPayload | null {
  const [meta, setMeta] = useState<TelemetryMetaPayload | null>(frameSource.meta);

  useEffect(() => {
    const sync = () => setMeta(frameSource.meta);
    const unsub = frameSource.subscribe(sync);
    void frameSource.load().then(sync);
    sync();
    return () => {
      unsub();
    };
  }, []);

  return meta;
}
