import { useId, useMemo, useState } from "react";
import { CHANNELS, type ChannelKey, type Sample, type Severity } from "@/lib/telemetry/types";

/**
 * Multi-channel time plot.
 *
 * Three rules make grouped channels readable:
 *  - every series gets its own colour, so FL/FR/RL/RR are told apart at a glance
 *    (dash patterns are a secondary cue, not the only one);
 *  - series sharing a unit share one y-domain, so four tire temperatures are
 *    compared against each other rather than each being stretched to fill the
 *    box. Mixed-unit plots fall back to per-series scaling, and the legend says so;
 *  - with `windowMs` the x-axis is a fixed-width window anchored to the newest
 *    sample, so the trace scrolls right-to-left at a constant rate and old
 *    samples leave the frame. Without it the axis fits the data, which is what
 *    a finished recording wants.
 */

const SERIES_STROKE = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
];
const DASH = ["none", "5 3", "2 2", "8 3 2 3", "1 3", "6 2 1 2"];

/** Index of the sample closest to `t`; samples are time-ordered. */
function nearestIndex(samples: Sample[], t: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  const prev = samples[Math.max(0, lo - 1)]!;
  return Math.abs(prev.t - t) <= Math.abs(samples[lo]!.t - t) ? Math.max(0, lo - 1) : lo;
}

export function Plot({
  samples,
  channels,
  height = 150,
  cursorT,
  markers = [],
  windowMs,
}: {
  samples: Sample[];
  channels: ChannelKey[];
  height?: number;
  cursorT?: number | null;
  markers?: { t: number; severity: Severity }[];
  /** Fixed time span of the x-axis. Omit to fit the axis to the data. */
  windowMs?: number;
}) {
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null);
  const clipId = useId();
  const w = 1000;
  const h = height;
  const key = channels.join("|");

  // The newest sample pins the right edge; with `windowMs` the left edge is a
  // fixed distance behind it, so the trace travels instead of being rescaled.
  const tEnd = samples.length ? samples[samples.length - 1]!.t : 0;
  const fitted = samples.length ? tEnd - samples[0]!.t : 0;
  const span = Math.max(1, windowMs ?? fitted);
  const tStart = tEnd - span;

  const { series, sharedUnit } = useMemo(() => {
    if (samples.length < 2) return { series: [], sharedUnit: null as string | null };

    const raw = channels.map((channelKey) => {
      const meta = CHANNELS.find((c) => c.key === channelKey)!;
      const vals = samples.map((s) => Number(s[channelKey as keyof Sample]));
      return { key: channelKey, meta, vals, min: Math.min(...vals), max: Math.max(...vals) };
    });

    // One domain when every channel is in the same unit — that is what makes a
    // four-corner comparison mean anything.
    const units = new Set(raw.map((r) => r.meta.unit));
    const shared = units.size === 1 && raw.length > 1 ? (raw[0]!.meta.unit ?? "") : null;
    const groupMin = Math.min(...raw.map((r) => r.min));
    const groupMax = Math.max(...raw.map((r) => r.max));

    const built = raw.map((entry) => {
      const min = shared !== null ? groupMin : entry.min;
      const max = shared !== null ? groupMax : entry.max;
      const range = max - min || 1;
      const d = samples
        .map((s, i) => {
          const x = ((s.t - tStart) / span) * w;
          const y = h - 8 - ((entry.vals[i]! - min) / range) * (h - 20);
          return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");
      return { key: entry.key, meta: entry.meta, d, min: entry.min, max: entry.max };
    });

    return { series: built, sharedUnit: shared };
    // `key` stands in for `channels`, which callers pass as a fresh array literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, key, h, tStart, span]);

  if (samples.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-border"
        style={{ height }}
      >
        <span className="label-xs">awaiting telemetry — no data</span>
      </div>
    );
  }

  const hovered = hover ? samples[hover.i] : null;
  const xOf = (t: number) => ((t - tStart) / span) * w;

  const description = `Time plot of ${series
    .map((s) => s.meta.label)
    .join(", ")} over ${(span / 1000).toFixed(0)} seconds`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={description}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          // Pick by time, not by array position: with a fixed window the buffer
          // does not necessarily span the full width.
          const i = nearestIndex(samples, tStart + frac * span);
          setHover({ x: xOf(samples[i]!.t), i });
        }}
      >
        <defs>
          {/* Samples that have scrolled past the left edge stop painting. */}
          <clipPath id={clipId}>
            <rect x={0} y={0} width={w} height={h} />
          </clipPath>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={0}
            x2={w}
            y1={h * g}
            y2={h * g}
            stroke="var(--border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <g clipPath={`url(#${clipId})`}>
          {markers.map((m, i) => (
            <line
              key={i}
              x1={xOf(m.t)}
              x2={xOf(m.t)}
              y1={0}
              y2={h}
              stroke={m.severity === "CRITICAL" ? "var(--crit)" : "var(--warn)"}
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {series.map((s, i) => (
            <path
              key={s.key}
              d={s.d}
              fill="none"
              stroke={SERIES_STROKE[i % SERIES_STROKE.length]}
              strokeWidth={1.6}
              strokeDasharray={DASH[i % DASH.length]}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {typeof cursorT === "number" && (
            <line
              x1={xOf(cursorT)}
              x2={xOf(cursorT)}
              y1={0}
              y2={h}
              stroke="var(--primary)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {hover && (
            <line
              x1={hover.x}
              x2={hover.x}
              y1={0}
              y2={h}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s, i) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <svg width="24" height="6" className="shrink-0" aria-hidden>
              <line
                x1={0}
                y1={3}
                x2={24}
                y2={3}
                stroke={SERIES_STROKE[i % SERIES_STROKE.length]}
                strokeWidth={2}
                strokeDasharray={DASH[i % DASH.length]}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="label-xs">
              {s.meta.label}
              {s.meta.unit ? ` (${s.meta.unit})` : ""}
            </span>
            <span className="num text-[0.65rem] text-foreground">
              {hovered
                ? Number(hovered[s.key as keyof Sample]).toFixed(2)
                : `${s.min.toFixed(1)}…${s.max.toFixed(1)}`}
            </span>
          </span>
        ))}
        {hovered && (
          <span className="num text-[0.65rem] text-primary">
            t = {(hovered.t / 1000).toFixed(2)} s
          </span>
        )}
        <span className="label-xs ml-auto">
          {windowMs ? `${(span / 1000).toFixed(0)} s window · ` : ""}
          {sharedUnit === null ? "each series scaled separately" : "shared scale"}
        </span>
      </div>
    </div>
  );
}

export const WINDOWS = [
  { label: "5 s", ms: 5000 },
  { label: "10 s", ms: 10000 },
  { label: "30 s", ms: 30000 },
  { label: "60 s", ms: 60000 },
  { label: "Session", ms: Infinity },
];

export function windowSamples(samples: Sample[], ms: number) {
  if (!samples.length || ms === Infinity) return samples;
  const end = samples[samples.length - 1]!.t;
  return samples.filter((s) => s.t >= end - ms);
}
