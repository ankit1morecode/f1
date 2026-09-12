import { createFileRoute, Link } from "@tanstack/react-router";
import { RaceCar } from "@/components/race/RaceCar";
import { TrackMap } from "@/components/race/TrackMap";
import { PitControl } from "@/components/race/PitControl";
import { CircuitPicker } from "@/components/race/CircuitPicker";
import { TireAdvice } from "@/components/race/TireAdvice";
import { DecisionStream } from "@/components/telemetry/DecisionStream";
import { Plot, windowSamples } from "@/components/telemetry/Plot";
import { Panel, Stat } from "@/components/ui/Panel";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";
import { fmtSpeed, speedLabel, useSettings } from "@/lib/telemetry/settings";
import { DriverSwitch } from "@/components/race/DriverSwitch";
import { useDriverProfile } from "@/lib/telemetry/driverProfiles";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live Race — SlipStream-X" },
      {
        name: "description",
        content:
          "Live four-corner race-car telemetry, tire state, track position, pit control and decision stream.",
      },
      { property: "og:title", content: "Live Race — SlipStream-X" },
      {
        property: "og:description",
        content: "One car, four tires and a synchronized race-engineering session.",
      },
    ],
  }),
  component: LiveRace,
});

function LiveRace() {
  const { latest, history, events, tires, pit, track, strategy, driver } = useTelemetry();
  const settings = useSettings();
  const driverProfile = useDriverProfile(driver.id);
  const win = windowSamples(history, settings.windowMs);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-carbon pb-4">
        <div>
          <span className="label-xs text-primary">Live race · {track.name}</span>
          <h1 className="font-display text-3xl font-bold">
            Car #{driver.carNumber} · {driverProfile.name} · Lap {track.lap}
          </h1>
          <p className="text-sm text-muted-foreground">
            {driver.carName} · Sector {track.sector} · {(track.progress * 100).toFixed(1)}% around
            the lap
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-5">
          <Mini label="Compound" value={tires.compound} />
          <Mini label="Set" value={tires.setId} />
          <Mini label="Stint" value={`${tires.stintAgeLaps} laps`} />
          <DriverSwitch active={driver} />
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(620px,1.35fr)_minmax(360px,.65fr)]">
        <Panel title="Four-corner vehicle state" kind="measured">
          <RaceCar tires={tires} />
        </Panel>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Overall grip" value={latest?.gripScore.toFixed(1)} kind="inferred" />
            <Stat
              label="Confidence"
              value={latest?.confidence.toFixed(0)}
              unit="%"
              kind="inferred"
            />
            <Stat
              label="Vehicle speed"
              value={fmtSpeed(latest?.speed, settings)}
              unit={speedLabel(settings)}
            />
            <Stat label="Strategy" value={strategy.pitWindow} kind="inferred" />
          </div>
          <Panel title="Pit control">
            <PitControl pit={pit} />
          </Panel>
          <Panel title="Race engineer feed">
            <DecisionStream events={events} maxHeight={270} />
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_.8fr]">
        <Panel title="Live circuit">
          <TrackMap track={track} events={events} />
          <div className="mt-4">
            <CircuitPicker activeId={track.circuitId} />
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Recommended tires" kind="inferred">
            <TireAdvice strategy={strategy} />
          </Panel>
          <Panel title="Tire condition trend" kind="measured">
            <Plot
              samples={win}
              channels={["tireTempFL", "tireTempFR", "tireTempRL", "tireTempRR"]}
              height={200}
              markers={events
                .filter((e) => e.category === "PIT")
                .map((e) => ({ t: e.t, severity: e.severity }))}
              windowMs={settings.windowMs}
            />
            <Link to="/telemetry" className="story-link mt-4 self-start text-sm text-primary">
              Open all 32 channels →
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="label-xs block">{label}</span>
      <span className="num font-semibold">{value}</span>
    </div>
  );
}
