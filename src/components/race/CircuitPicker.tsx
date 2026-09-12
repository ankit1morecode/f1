import { Button } from "@/components/ui/button";
import { CIRCUITS } from "@/lib/telemetry/circuits";
import { engine } from "@/lib/telemetry/engine";
import { cn } from "@/lib/utils";

export function CircuitPicker({ activeId }: { activeId: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CIRCUITS.map((c) => (
          <Button key={c.id} size="sm" variant="outline" onClick={() => engine.setCircuit(c.id)}
            className={cn("whitespace-nowrap rounded-full", activeId === c.id && "border-primary text-primary")}>
            {c.name}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Choosing a circuit restarts the lap counter and changes surface wear, speed and tire choice. Session history is kept.
      </p>
    </div>
  );
}
