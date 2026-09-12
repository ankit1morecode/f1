import { createFileRoute } from "@tanstack/react-router";
import { Panel, Stat } from "@/components/ui/Panel";
import { Plot, windowSamples } from "@/components/telemetry/Plot";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";
import { PROTOCOL_VERSION } from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "System Health — SlipStream-X" },
      {
        name: "description",
        content:
          "Sensor, CAN, logging, watchdog, temperature, voltage and transport diagnostics reported independently of grip inference.",
      },
      { property: "og:title", content: "System Health — SlipStream-X" },
      {
        property: "og:description",
        content:
          "Sensor, bus, logging, power and transport diagnostics shown independently of grip inference.",
      },
    ],
  }),
  component: Health,
});

const TONE: Record<string, string> = {
  OK: "text-ok border-ok/40",
  DEGRADED: "text-warn border-warn/40",
  FAULT: "text-crit border-crit/50",
};

function Health() {
  const { health, connection, session, history, latest } = useTelemetry(6);
  const win = windowSamples(history, 60000);

  return (
    <div className="space-y-4">
      <Panel title="Hardware health — reported by firmware, independent of grip inference">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["IMU / sensors", health.imu],
              ["CAN bus", health.can],
              ["Logging", health.logging],
              ["Watchdog", health.watchdog],
            ] as const
          ).map(([label, state]) => (
            <div key={label} className={cn("panel border-l-2 px-3 py-3", TONE[state])}>
              <span className="label-xs block">{label}</span>
              <span className="num text-lg">{state}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Board temperature" value={health.boardTemp.toFixed(1)} unit="°C" />
        <Stat label="Supply voltage" value={health.supplyVoltage.toFixed(2)} unit="V" />
        <Stat label="Track humidity" value={latest?.humidity.toFixed(1)} unit="%" />
        <Stat label="Packet rate" value={connection.packetRate} unit="Hz" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Transport diagnostics">
          <dl className="space-y-2 text-xs">
            <Row k="Status" v={connection.status} />
            <Row k="Latency" v={`${connection.latencyMs.toFixed(1)} ms`} />
            <Row k="Packet loss" v={`${connection.lossPct.toFixed(2)} %`} />
            <Row k="Malformed frames" v={String(connection.malformed)} />
            <Row k="Packets received" v={String(session.packets)} />
            <Row
              k="Protocol version"
              v={
                connection.versionMismatch
                  ? `MISMATCH (${PROTOCOL_VERSION})`
                  : `v${PROTOCOL_VERSION} accepted`
              }
            />
            <Row k="Software version" v={session.softwareVersion} />
            <Row
              k="Data source"
              v={
                connection.source === "measured"
                  ? "Supplied dataset (MongoDB)"
                  : "Behavioural model"
              }
            />
          </dl>
        </Panel>
        <Panel title="Acceleration trend — last 60 s" kind="measured">
          <Plot samples={win} channels={["ax", "ay"]} height={170} windowMs={60000} />
        </Panel>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
      <dt className="label-xs">{k}</dt>
      <dd className="num text-xs">{v}</dd>
    </div>
  );
}
