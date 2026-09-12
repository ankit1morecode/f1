import { useMemo, useState } from "react";
import { CHANNELS, type ChannelKey, type Sample } from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

const DASH = ["none", "6 3", "2 3"];

const KIND_STROKE: Record<string, string> = {
  measured: "var(--measured)",
  derived: "var(--derived)",
  inferred: "var(--inferred)",
};

export function Plot({
  samples,
  channels,
  height = 150,
  cursorT,
  markers = [],
}: {
  samples: Sample[];
  channels: ChannelKey[];
  height?: number;
  cursorT?: number | null;
  markers?: { t: number; severity: string }[];
}) {
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null);
  const w = 1000;
  const h = height;

  const series = useMemo(() => {
    if (samples.length < 2) return [];
    const t0 = samples[0]!.t;
    const t1 = samples[samples.length - 1]!.t || t0 + 1;
    const span = Math.max(1, t1 - t0);
    return channels.map((key) => {
      const meta = CHANNELS.find((c) => c.key === key)!;
      const vals = samples.map((s) => Number(s[key as keyof Sample]));
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const range = max - min || 1;
      const d = samples
        .map((s, i) => {
          const x = ((s.t - t0) / span) * w;
          const y = h - 8 - ((vals[i]! - min) / range) * (h - 20);

          return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");
      return { key, meta, d, min, max };
    });
  }, [samples, channels, h]);

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

  const t0 = samples[0]!.t;
  const span = Math.max(1, samples[samples.length - 1]!.t - t0);

  const hovered = hover ? samples[hover.i] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - r.left) / r.width;
          setHover({
            x: frac * w,
            i: Math.min(samples.length - 1, Math.max(0, Math.round(frac * (samples.length - 1)))),
          });
        }}
      >
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
        {markers.map((m, i) => (
          <line
            key={i}
            x1={((m.t - t0) / span) * w}
            x2={((m.t - t0) / span) * w}
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
            stroke={KIND_STROKE[s.meta.kind]}
            strokeWidth={s.meta.kind === "inferred" ? 2 : 1.25}
            strokeDasharray={DASH[i % DASH.length]}
            opacity={1 - (i % 3) * 0.18}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {typeof cursorT === "number" && (
          <line
            x1={((cursorT - t0) / span) * w}
            x2={((cursorT - t0) / span) * w}
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
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-4"
              style={{ backgroundColor: KIND_STROKE[s.meta.kind] }}
            />
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
          <span className={cn("num text-[0.65rem] text-primary")}>
            t = {(hovered.t / 1000).toFixed(2)} s
          </span>
        )}
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
