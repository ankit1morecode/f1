import type { Sample } from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

/** Behavioural zone map — shows only firmware-supplied dominant zone + measured load. */
export function VehicleZones({ s }: { s: Sample | null }) {
  const zone = s?.zone ?? null;
  const front = s ? Math.max(0, -s.ax) : 0;
  const rear = s ? Math.max(0, s.ax) : 0;
  const left = s ? Math.max(0, -s.ay) : 0;
  const right = s ? Math.max(0, s.ay) : 0;

  const cell = (key: string, load: number, label: string) => (
    <div
      className={cn(
        "panel relative flex h-16 items-center justify-center overflow-hidden",
        zone === key && "border-primary",
      )}
    >
      <div
        className="absolute inset-x-0 bottom-0 bg-primary/25"
        style={{ height: `${Math.min(100, load * 70)}%` }}
      />
      <div className="relative text-center">
        <span className="label-xs block">{label}</span>
        <span className="num text-xs text-measured">{s ? load.toFixed(2) : "--"} g</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {cell("FRONT_AXLE", front, "front axle")}
        {cell("REAR_AXLE", rear, "rear axle")}
        {cell("LEFT", left, "left")}
        {cell("RIGHT", right, "right")}
      </div>
      <p className="label-xs">
        dominant zone: <span className="text-inferred">{zone?.replace("_", " ") ?? "no data"}</span>
      </p>
    </div>
  );
}
