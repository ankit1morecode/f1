import { createFileRoute, Link } from "@tanstack/react-router";
import { GripCore } from "@/components/telemetry/GripCore";
import { DecisionStream } from "@/components/telemetry/DecisionStream";
import { Plot, windowSamples } from "@/components/telemetry/Plot";
import { Panel, Stat } from "@/components/ui/Panel";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";
import {
  accelLabel,
  fmt,
  fmtAccel,
  fmtSpeed,
  fmtTemp,
  speedLabel,
  tempLabel,
  useSettings,
} from "@/lib/telemetry/settings";


export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "SlipStream-X — Grip Telemetry Overview" },
      {
        name: "description",
        content:
          "Overview console for the SlipStream-X behavioural grip platform: inferred grip score, state, confidence, vehicle status and session summary.",
      },
      { property: "og:title", content: "SlipStream-X — Grip Telemetry Overview" },
      {
        property: "og:description",
        content:
          "Inferred grip, confidence, decision stream and session summary for the SlipStream-X telemetry platform.",
      },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { latest, history, events, connection, session, health } = useTelemetry();
  const settings = useSettings();
  const win = windowSamples(history, settings.windowMs);

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Grip inference — inferred state" kind="inferred">
          <GripCore s={latest} />
        </Panel>
        <Panel title="Decision stream — highest priority first">
          <DecisionStream events={events.slice(0, 30)} maxHeight={200} />
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Vehicle speed"
          value={fmtSpeed(latest?.speed, settings)}
          unit={speedLabel(settings)}
        />
        <Stat
          label="Lateral accel"
          value={fmtAccel(latest?.ay, settings)}
          unit={accelLabel(settings)}
        />
        <Stat label="Yaw rate" value={fmt(latest?.yawRate, settings)} unit="°/s" />
        <Stat
          label="Vibration RMS"
          value={fmt(latest?.vibrationRms, settings, 1)}
          unit="m/s²"
          kind="derived"
        />
      </div>


      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <Panel
          title="Grip trajectory — last 30 s"
          kind="inferred"
          actions={
            <Link to="/live" className="label-xs text-primary">
              full dashboard →
            </Link>
          }
        >
          <Plot samples={win} channels={["gripScore", "ay"]} height={170} />
        </Panel>

        <Panel title="Session context">
          <dl className="space-y-2 text-xs">
            <Row k="Session / run" v={session.id} />
            <Row k="Profile" v={session.profile} />
            <Row k="Elapsed" v={`${(session.durationMs / 1000).toFixed(1)} s`} />
            <Row k="Packets" v={String(session.packets)} />
            <Row k="Packet loss" v={`${session.lossPct.toFixed(2)} %`} />
            <Row k="Transport" v={connection.status} />
            <Row k="Protocol" v={session.protocolVersion} />
            <Row k="Board temp" v={`${fmtTemp(health.boardTemp, settings)} ${tempLabel(settings)}`} />
          </dl>
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
