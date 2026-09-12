import { useState } from "react";
import carTop from "@/assets/f1-car-top.png";
import type { Corner, TireCornerState, TireSetState } from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

const CORNERS: Corner[] = ["FL", "FR", "RL", "RR"];
/**
 * Tire centres measured off the car artwork. It is 1024x1536 (exactly 2:3) shown
 * with `object-contain` in a 2:3 box, so image percentages map straight onto the
 * container. Each badge is centred on its tire with a translate rather than
 * pinned to an edge, so resizing the badge cannot pull it off the tire.
 */
const POSITION: Record<Corner, string> = {
  FL: "left-[25.5%] top-[23%]",
  FR: "left-[74.5%] top-[23%]",
  RL: "left-[25.5%] top-[83.5%]",
  RR: "left-[74.5%] top-[83.5%]",
};
const TONE = {
  OPTIMAL: "bg-ok",
  DEGRADING: "bg-warn",
  HIGH_DEG: "bg-derived",
  CRITICAL: "bg-crit",
};

export function RaceCar({ tires }: { tires: TireSetState }) {
  const [selected, setSelected] = useState<Corner>("FR");
  const tire = tires.corners[selected];
  return (
    <div className="grid items-center gap-5 md:grid-cols-[minmax(280px,1fr)_230px]">
      <div className="relative mx-auto aspect-[2/3] w-full max-w-[400px] overflow-hidden rounded-xl border border-border bg-gradient-to-b from-muted/60 to-background">
        <img
          src={carTop}
          alt="Top-down view of the race car with its four tires"
          width={1024}
          height={1536}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-contain p-2"
        />
        {CORNERS.map((corner) => {
          const item = tires.corners[corner];
          return (
            <button
              key={corner}
              onClick={() => setSelected(corner)}
              aria-label={`Inspect ${corner} tire`}
              className={cn(
                "absolute z-10 w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-status-foreground/20 px-1.5 py-2 text-center text-status-foreground shadow-lg",
                POSITION[corner],
                TONE[item.condition],
                selected === corner && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              <span className="font-display text-sm font-bold">{corner}</span>
              <span className="num block text-[0.65rem]">
                {item.temperature.toFixed(0)}° · {item.degradation.toFixed(0)}%
              </span>
            </button>
          );
        })}
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card/90 px-3 py-1 text-[0.65rem] font-semibold text-muted-foreground">
          {tires.compound} · {tires.setId}
        </span>
      </div>
      <TireReadout tire={tire} />
    </div>
  );
}

function TireReadout({ tire }: { tire: TireCornerState }) {
  const rows: [string, string][] = [
    ["Condition", tire.condition.replace("_", " ")],
    ["Grip", `${tire.grip.toFixed(1)} %`],
    ["Degradation", `${tire.degradation.toFixed(1)} %`],
    ["Temperature", `${tire.temperature.toFixed(1)} °C`],
    ["Pressure", `${tire.pressure.toFixed(2)} bar`],
    ["Ride height", `${tire.rideHeight.toFixed(1)} mm`],
    ["Steering", `${tire.steering.toFixed(1)}°`],
    ["Wheel speed", `${tire.wheelRpm.toFixed(0)} RPM`],
  ];
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <span className={cn("size-3 rounded-sm", TONE[tire.condition])} />
        <div>
          <span className="label-xs block">Selected corner</span>
          <strong className="font-display text-2xl">{tire.corner}</strong>
        </div>
      </div>
      <dl className="mt-3 divide-y divide-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-2">
            <dt className="label-xs">{k}</dt>
            <dd className="num text-xs font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
