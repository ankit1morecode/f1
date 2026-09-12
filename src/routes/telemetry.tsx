import { createFileRoute } from "@tanstack/react-router";
import { Plot, windowSamples } from "@/components/telemetry/Plot";
import { Panel, Stat } from "@/components/ui/Panel";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";
import type { ChannelKey } from "@/lib/telemetry/types";

export const Route = createFileRoute("/telemetry")({
  head: () => ({
    meta: [
      { title: "Telemetry — Physical Channels — SlipStream-X" },
      {
        name: "description",
        content:
          "Grouped variable classes covering every physical channel in the supplied Silverstone dataset.",
      },
      { property: "og:title", content: "Telemetry — SlipStream-X" },
      {
        property: "og:description",
        content: "Inspect every measured channel with synchronized charts and pit boundaries.",
      },
    ],
  }),
  component: TelemetryPage,
});

const GROUPS: { title: string; channels: ChannelKey[]; kind: "measured" | "derived" }[] = [
  {
    title: "Tire temperature · FL / FR / RL / RR",
    channels: ["tireTempFL", "tireTempFR", "tireTempRL", "tireTempRR"],
    kind: "measured",
  },
  {
    title: "Tire pressure · FL / FR / RL / RR",
    channels: ["tirePressureFL", "tirePressureFR", "tirePressureRL", "tirePressureRR"],
    kind: "measured",
  },
  {
    title: "Wheel speed · FL / FR / RL / RR",
    channels: ["wheelRpmFL", "wheelRpmFR", "wheelRpmRL", "wheelRpmRR"],
    kind: "measured",
  },
  {
    title: "Ride height · FL / FR / RL / RR",
    channels: ["rideHeightFL", "rideHeightFR", "rideHeightRL", "rideHeightRR"],
    kind: "measured",
  },
  {
    title: "Steering · front / rear axle",
    channels: ["steer", "steerRear"],
    kind: "measured",
  },
  {
    title: "Braking pressure · front / rear",
    channels: ["brakeFront", "brakeRear"],
    kind: "measured",
  },
  {
    title: "Wing air pressure · front / rear",
    channels: ["wingPressureFront", "wingPressureRear"],
    kind: "measured",
  },
  {
    title: "Axle load · front / rear",
    channels: ["axleLoadFront", "axleLoadRear"],
    kind: "measured",
  },
  {
    title: "Vehicle dynamics · speed and acceleration",
    channels: ["speed", "ax", "ay"],
    kind: "measured",
  },
  {
    title: "Derived · slip, steering rate, vibration",
    channels: ["wheelSlip", "steerRate", "vibrationRms"],
    kind: "derived",
  },
];

function TelemetryPage() {
  const { latest, history, events, connection, track } = useTelemetry();
  const win = windowSamples(history, 60000);
  const markers = events
    .filter((e) => e.category === "PIT")
    .map((e) => ({ t: e.t, severity: e.severity }));
  const measured = connection.source === "measured";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="label-xs text-primary">
            {measured ? "Supplied dataset · Silverstone" : "Behavioural model"}
          </span>
          <h1 className="font-display text-3xl font-bold">Physical channels</h1>
        </div>
        <p className="max-w-lg text-sm text-muted-foreground">
          All groups share one 60-second time window. Pit and stint boundaries are retained on the
          timeline.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Lap" value={track.lap} />
        <Stat
          label="Active turn"
          value={track.activeTurn || "Straight"}
          hint={track.activeTurn ? track.turnPhase : "Between turns"}
        />
        <Stat label="Wheel slip" value={latest?.wheelSlip.toFixed(2)} unit="%" kind="derived" />
        <Stat label="Track humidity" value={latest?.humidity.toFixed(1)} unit="%" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {GROUPS.map((g) => (
          <Panel key={g.title} title={g.title} kind={g.kind}>
            <Plot
              samples={win}
              channels={g.channels}
              height={155}
              markers={markers}
              windowMs={60000}
            />
          </Panel>
        ))}
      </div>
    </div>
  );
}
