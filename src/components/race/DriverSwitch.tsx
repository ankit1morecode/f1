import { engine } from "@/lib/telemetry/engine";
import { DRIVERS, type Driver } from "@/lib/telemetry/drivers";
import { useDriverProfile } from "@/lib/telemetry/driverProfiles";
import { cn } from "@/lib/utils";

/** Choose which of the two drivers is in the car. */
export function DriverSwitch({
  active,
  tone = "light",
}: {
  active: Driver;
  tone?: "light" | "dark";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {DRIVERS.map((d) => (
        <DriverOption key={d.id} driver={d} on={d.id === active.id} tone={tone} />
      ))}
    </div>
  );
}

function DriverOption({
  driver,
  on,
  tone,
}: {
  driver: Driver;
  on: boolean;
  tone: "light" | "dark";
}) {
  const profile = useDriverProfile(driver.id);
  return (
    <button
      onClick={() => engine.setDriver(driver.id)}
      aria-pressed={on}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-none",
        tone === "dark"
          ? on
            ? "border-primary bg-primary/15 text-carbon-foreground"
            : "border-carbon-foreground/25 text-carbon-foreground/70"
          : on
            ? "border-primary bg-primary/5 text-foreground"
            : "border-border text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "num flex size-9 items-center justify-center rounded-xl text-sm font-bold",
          on ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/70",
        )}
      >
        {driver.carNumber}
      </span>
      <span>
        <span className="font-display block text-sm font-semibold">{profile.name}</span>
        <span className="block text-xs opacity-75">{driver.carName}</span>
      </span>
    </button>
  );
}

/** Compact name + car readout. */
export function DriverBadge({ driver }: { driver: Driver }) {
  const profile = useDriverProfile(driver.id);
  return (
    <span className="flex items-center gap-2.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5">
      <span className="num flex size-6 items-center justify-center rounded-lg bg-primary text-[0.7rem] font-bold text-primary-foreground">
        {driver.carNumber}
      </span>
      <span className="text-sm text-foreground/85">{profile.name}</span>
      <span className="hidden text-xs text-muted-foreground lg:inline">{driver.carName}</span>
    </span>
  );
}
