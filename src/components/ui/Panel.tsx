import type { ReactNode } from "react";
import { useSettings } from "@/lib/telemetry/settings";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  kind,
  actions,
  children,
  className,
}: {
  title?: string;
  kind?: "measured" | "derived" | "inferred";
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel panel-accent flex flex-col p-5", className)}>
      {(title || actions) && (
        <header className="mb-4 flex items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            {kind && <KindDot kind={kind} />}
            <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

const KIND_HELP = {
  measured: "Measured directly by a sensor",
  derived: "Calculated from measured values",
  inferred: "Estimated by the system",
} as const;

export function KindDot({ kind }: { kind: "measured" | "derived" | "inferred" }) {
  const { showProvenance } = useSettings();
  if (!showProvenance) return null;
  const cls =
    kind === "measured" ? "bg-measured" : kind === "derived" ? "bg-derived" : "bg-inferred";
  return <span className={cn("size-2 rounded-full", cls)} title={KIND_HELP[kind]} />;
}

export function Stat({
  label,
  value,
  unit,
  kind = "measured",
  hint,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  kind?: "measured" | "derived" | "inferred";
  hint?: string;
}) {
  const missing = value === null || value === undefined || value === "";
  const color =
    kind === "measured" ? "text-measured" : kind === "derived" ? "text-derived" : "text-inferred";
  return (
    <div className="panel px-4 py-3.5" title={KIND_HELP[kind]}>
      <div className="flex items-center gap-2">
        <KindDot kind={kind} />
        <span className="truncate text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        {missing ? (
          <span className="text-base text-stale">No reading yet</span>
        ) : (
          <>
            <span className={cn("num text-2xl font-semibold", color)}>{value}</span>
            {unit && <span className="num text-xs text-muted-foreground">{unit}</span>}
          </>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
