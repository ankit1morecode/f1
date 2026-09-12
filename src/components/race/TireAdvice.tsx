import type { StrategyState } from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

const COLOR: Record<string, string> = { SOFT: "bg-crit", MEDIUM: "bg-warn", HARD: "bg-carbon" };

export function TireAdvice({ strategy }: { strategy: StrategyState }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
        <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-background", COLOR[strategy.finalCompound])}>
          {strategy.finalCompound[0]}
        </span>
        <div>
          <span className="label-xs block text-primary">Final tire choice</span>
          <strong className="font-display text-2xl font-bold">Fit {strategy.finalCompound}</strong>
          <p className="mt-1 text-sm text-muted-foreground">{strategy.finalReason}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {strategy.ranking.map((r, i) => (
          <li key={r.compound} className="flex items-center gap-3">
            <span className="num w-5 text-xs text-muted-foreground">{i + 1}</span>
            <span className={cn("size-2.5 rounded-full", COLOR[r.compound])} />
            <span className="font-display w-20 text-sm font-semibold">{r.compound}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", i === 0 ? "bg-primary" : "bg-muted-foreground/40")} style={{ width: `${r.score}%` }} />
            </span>
            <span className="num w-10 text-right text-xs">{r.score}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{strategy.ranking[0]?.note}</p>
    </div>
  );
}
