import { useEffect, useState } from "react";

export type SpeedUnit = "kmh" | "mph";
export type AccelUnit = "g" | "ms2";
export type TempUnit = "c" | "f";

export interface Settings {
  /** grip-score cut-offs (0-100), high > medium > low */
  gripHigh: number;
  gripMedium: number;
  gripLow: number;
  /** a degrading trend only raises a warning below this grip score */
  degradingGrip: number;
  /** front-steering rate (deg/s) that counts as instability */
  steerRateWarn: number;
  /** lateral accel (g) that must be present alongside the steering activity */
  latAccelWarn: number;
  /** wheel-speed disagreement (%) reported as slip */
  wheelSlipWarn: number;
  /** vibration RMS (m/s²) reported as a surface note */
  vibrationInfo: number;
  /** confidence (%) below which sensor disagreement is raised */
  confidenceWarn: number;

  speedUnit: SpeedUnit;
  accelUnit: AccelUnit;
  tempUnit: TempUnit;

  /** digits after the decimal point on readouts */
  decimals: number;
  /** how often the screens refresh (Hz) */
  renderHz: number;
  /** default plot window (ms) */
  windowMs: number;
  /** how often the live session state is shared/broadcast (ms) */
  shareFrequencyMs: number;
  /** show the measured / calculated / estimated dots and notes */
  showProvenance: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  gripHigh: 78,
  gripMedium: 55,
  gripLow: 32,
  degradingGrip: 62,
  steerRateWarn: 18,
  latAccelWarn: 1.8,
  wheelSlipWarn: 2,
  vibrationInfo: 9,
  confidenceWarn: 55,
  speedUnit: "kmh",
  accelUnit: "g",
  tempUnit: "c",
  decimals: 1,
  renderHz: 12,
  windowMs: 30000,
  shareFrequencyMs: 500,
  showProvenance: true,
};

const KEY = "slipstreamx.settings.v2";
const listeners = new Set<() => void>();

let current: Settings = load();

function load(): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable — keep in-memory settings */
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  persist();
  for (const l of listeners) l();
}

export function resetSettings() {
  current = { ...DEFAULT_SETTINGS };
  persist();
  for (const l of listeners) l();
}

export function subscribeSettings(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSettings(): Settings {
  // Start from defaults so the first client render matches the server render,
  // then adopt stored settings after hydration.
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    setS(getSettings());
    const unsub = subscribeSettings(() => setS(getSettings()));
    return () => {
      unsub();
    };
  }, []);
  return s;
}

/* ---------- formatting helpers ---------- */

const nf = (v: number, d: number) => v.toFixed(Math.max(0, Math.min(3, d)));

export function fmt(v: number | null | undefined, s: Settings, extraDigits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return nf(v, s.decimals + extraDigits);
}

export function speedLabel(s: Settings) {
  return s.speedUnit === "mph" ? "mph" : "km/h";
}
export function fmtSpeed(kmh: number | null | undefined, s: Settings) {
  if (kmh === null || kmh === undefined) return null;
  return nf(s.speedUnit === "mph" ? kmh * 0.621371 : kmh, s.decimals);
}

export function accelLabel(s: Settings) {
  return s.accelUnit === "ms2" ? "m/s²" : "g";
}
export function fmtAccel(g: number | null | undefined, s: Settings) {
  if (g === null || g === undefined) return null;
  return nf(s.accelUnit === "ms2" ? g * 9.80665 : g, s.decimals + 1);
}

export function tempLabel(s: Settings) {
  return s.tempUnit === "f" ? "°F" : "°C";
}
export function fmtTemp(c: number | null | undefined, s: Settings) {
  if (c === null || c === undefined) return null;
  return nf(s.tempUnit === "f" ? c * 1.8 + 32 : c, s.decimals);
}
