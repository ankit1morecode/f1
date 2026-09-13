import { useState } from "react";
import { SEVERITY_RANK, type Severity, type TelemetryEvent } from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

const SEV_CLASS: Record<Severity, string> = {
  INFO: "border-border text-muted-foreground",
  ADVISORY: "border-derived/50 text-derived",
  WARNING: "border-warn/50 text-warn",
  CRITICAL: "border-crit text-crit",
};

/** How long an event stays the headline in the banner. */
const ACTIVE_WINDOW_MS = 8000;

const SEVERITIES: Severity[] = ["INFO", "ADVISORY", "WARNING", "CRITICAL"];

const SEV_LABEL: Record<Severity, string> = {
  INFO: "All",
  ADVISORY: "Advisory +",
  WARNING: "Warning +",
  CRITICAL: "Critical only",
};

const SEV_DOT: Record<Severity, string> = {
  INFO: "bg-border",
  ADVISORY: "bg-derived/60",
  WARNING: "bg-warn/70",
  CRITICAL: "bg-crit",
};

export function DecisionStream({
  events,
  onInspect,
  maxHeight = 320,
}: {
  events: TelemetryEvent[];
  onInspect?: (e: TelemetryEvent) => void;
  maxHeight?: number;
}) {
  const [minSev, setMinSev] = useState<Severity>("INFO");
  const filtered = events.filter((e) => SEVERITY_RANK[e.severity] >= SEVERITY_RANK[minSev]);
  // Highest severity within the last few seconds, not of all time: reducing over
  // the whole buffer pinned the first CRITICAL to the banner for the rest of the
  // session, long after the car had been caught.
  const newest = events[0]?.t ?? 0;
  const recent = events.filter((e) => newest - e.t < ACTIVE_WINDOW_MS);
  const pool = recent.length ? recent : events.slice(0, 1);
  const active = pool.length
    ? pool.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a))
    : null;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {active ? (
        <div
          className={cn(
            "rounded-xl border bg-secondary/30 p-3.5",
            SEV_CLASS[active.severity],
            active.severity === "CRITICAL" && "crit-pulse",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="label-xs">Needs attention · {active.severity.toLowerCase()}</span>
            <span className="num text-xs text-muted-foreground">
              {(active.t / 1000).toFixed(2)} s
            </span>
          </div>
          <p className="font-display mt-1.5 text-lg text-foreground">{active.title}</p>
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{active.detail}</p>
        </div>
      ) : (
        <p className="label-xs">no events — link idle</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label-xs mr-1">Show</span>
        {SEVERITIES.map((s) => (
          <button
            key={s}
            onClick={() => setMinSev(s)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium",
              minSev === s
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {SEV_LABEL[s]}
          </button>
        ))}
      </div>

      <ul className="min-h-0 divide-y divide-border overflow-y-auto pr-1" style={{ maxHeight }}>
        {filtered.map((e) => (
          <li key={e.id}>
            <button
              onClick={() => onInspect?.(e)}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left"
            >
              <span className="num w-12 shrink-0 pt-0.5 text-[0.7rem] text-muted-foreground">
                {(e.t / 1000).toFixed(1)}s
              </span>
              <span
                className={cn(
                  "mt-0.5 w-1.5 shrink-0 self-stretch rounded-full",
                  SEV_DOT[e.severity],
                )}
              />
              <span className="flex-1">
                <span className="block text-[0.8125rem] font-medium text-foreground">
                  {e.title}
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">{e.detail}</span>
              </span>
              <span className="label-xs shrink-0 pt-0.5">{e.category}</span>
            </button>
          </li>
        ))}
        {!filtered.length && (
          <li className="label-xs py-4 text-center">Nothing at this level right now</li>
        )}
      </ul>
    </div>
  );
}
