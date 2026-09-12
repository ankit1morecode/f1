import { Button } from "@/components/ui/button";
import { engine } from "@/lib/telemetry/engine";
import { COMPOUND_SPEC } from "@/lib/telemetry/drivers";
import type { PitState, TireCompound } from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

const COMPOUNDS: TireCompound[] = ["SOFT", "MEDIUM", "HARD"];
export function PitControl({ pit }: { pit: PitState }) {
  const active = pit.status === "REQUESTED";
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {COMPOUNDS.map((c) => (
          <Button
            key={c}
            size="sm"
            variant="outline"
            disabled={active}
            onClick={() => engine.setNextCompound(c)}
            className={cn(
              "h-auto flex-col items-start gap-0.5 py-2 text-left",
              pit.nextCompound === c && "border-primary text-primary",
            )}
          >
            <span className="font-display text-sm font-semibold">{c}</span>
            <span className="num text-[0.65rem] opacity-80">
              starts at {COMPOUND_SPEC[c].startGrip}% grip
            </span>
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{COMPOUND_SPEC[pit.nextCompound].label}.</p>
      <Button
        onClick={() => engine.requestPit()}
        disabled={active}
        className="h-14 w-full rounded-md font-display text-lg font-bold"
      >
        {active
          ? `PIT IN ${(pit.countdownMs / 1000).toFixed(1)} S`
          : `BOX · FIT ${pit.nextCompound}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Session, lap, track and historical telemetry continue through the stop. Wear starts again
        from zero on the new set.
      </p>
    </div>
  );
}
