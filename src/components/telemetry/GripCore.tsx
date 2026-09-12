import type { Sample } from "@/lib/telemetry/types";
import { fmt, useSettings } from "@/lib/telemetry/settings";
import { cn } from "@/lib/utils";


const STATE_CLASS: Record<string, string> = {
  HIGH: "text-ok",
  MEDIUM: "text-warn",
  LOW: "text-primary",
  CRITICAL: "text-crit",
};

const TREND_GLYPH: Record<string, string> = {
  IMPROVING: "▲",
  STABLE: "■",
  DEGRADING: "▼",
  RECOVERING: "◆",
};

export function GripCore({ s, compact = false }: { s: Sample | null; compact?: boolean }) {
  const settings = useSettings();
  const score = s?.gripScore ?? null;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const r = 84;

  const circ = Math.PI * r * 1.5;

  return (
    <div className={cn("flex items-center gap-6", compact && "gap-4")}>
      <div className="relative shrink-0">
        <svg viewBox="0 0 200 200" className={compact ? "size-32" : "size-44"}>
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="var(--secondary)"
            strokeWidth="12"
            strokeDasharray={`${circ} 999`}
            strokeLinecap="round"
            transform="rotate(135 100 100)"
          />
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="12"
            strokeDasharray={`${(circ * pct) / 100} 999`}
            strokeLinecap="round"
            transform="rotate(135 100 100)"
            style={{ transition: "stroke-dasharray 120ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="label-xs">grip · inferred</span>
          <span className={cn("num font-semibold", compact ? "text-3xl" : "text-4xl")}>
            {score === null ? "--" : fmt(score, settings)}
          </span>
          <span className={cn("font-display text-xs", STATE_CLASS[s?.gripState ?? ""] ?? "text-stale")}>
            {s?.gripState ?? "NO DATA"}
          </span>
        </div>
      </div>

      <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Trend">
          <span className="num">
            {TREND_GLYPH[s?.trend ?? ""] ?? "–"} {s?.trend ?? "NO DATA"}
          </span>
        </Field>
        <Field label="Confidence">
          <span className="num">{s ? `${s.confidence.toFixed(0)} %` : "NO DATA"}</span>
        </Field>
        <Field label="Dominant zone">
          <span className="num">{s?.zone.replace("_", " ") ?? "NO DATA"}</span>
        </Field>
        <Field label="Reserve margin">
          <span className="num">{s ? `${fmt(s.reserve, settings)} %` : "NO DATA"}</span>
        </Field>
        <Field label="Sample time">
          <span className="num">{s ? `${(s.t / 1000).toFixed(2)} s` : "--"}</span>
        </Field>
        <Field label="Sequence">
          <span className="num">{s ? `#${s.seq}` : "--"}</span>
        </Field>
      </dl>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-xs">{label}</dt>
      <dd className="mt-0.5 text-sm text-inferred">{children}</dd>
    </div>
  );
}
