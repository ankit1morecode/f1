import { createFileRoute } from "@tanstack/react-router";
import { Plot, windowSamples } from "@/components/telemetry/Plot";
import { Panel, Stat } from "@/components/ui/Panel";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";
import type { ChannelKey } from "@/lib/telemetry/types";

export const Route = createFileRoute("/telemetry")({ head: () => ({ meta: [
  { title: "Telemetry — 32 Channels — SlipStream-X" }, { name: "description", content: "Nine grouped variable classes covering all 32 physical race-car channels." },
  { property: "og:title", content: "Telemetry — SlipStream-X" }, { property: "og:description", content: "Inspect all 32 physical channels with synchronized charts and pit boundaries." },
] }), component: TelemetryPage });

const GROUPS: { title: string; channels: ChannelKey[] }[] = [
  { title: "Vehicle steering · FL / FR / RL / RR", channels: ["steeringFL","steeringFR","steeringRL","steeringRR"] },
  { title: "Ride height · FL / FR / RL / RR", channels: ["rideHeightFL","rideHeightFR","rideHeightRL","rideHeightRR"] },
  { title: "Tire temperature · FL / FR / RL / RR", channels: ["tireTempFL","tireTempFR","tireTempRL","tireTempRR"] },
  { title: "Accelerator pedal cross-verification", channels: ["app1","app2"] },
  { title: "Braking · front / rear", channels: ["brakeFront","brakeRear"] },
  { title: "Tire pressure · FL / FR / RL / RR", channels: ["tirePressureFL","tirePressureFR","tirePressureRL","tirePressureRR"] },
  { title: "Air pressure · front / hind Pitot", channels: ["pitotFront","pitotHind"] },
  { title: "Axle load · front / rear", channels: ["axleLoadFront","axleLoadRear"] },
  { title: "Corner speed · FL / FR / RL / RR", channels: ["speedFL","speedFR","speedRL","speedRR"] },
];

function TelemetryPage() { const { latest, history, events } = useTelemetry(); const win = windowSamples(history, 60000); const delta = latest ? Math.abs(latest.app1-latest.app2) : null; const markers = events.filter(e=>e.category === "PIT").map(e=>({t:e.t,severity:e.severity})); return <div className="space-y-4">
  <header className="flex flex-wrap items-end justify-between gap-3"><div><span className="label-xs text-primary">Nine variable classes</span><h1 className="font-display text-3xl font-bold">32 physical channels</h1></div><p className="max-w-lg text-sm text-muted-foreground">All groups share one 60-second time window. Pit and stint boundaries are retained on the timeline.</p></header>
  <div className="grid gap-3 sm:grid-cols-3"><Stat label="APP 1" value={latest?.app1.toFixed(1)} unit="%" /><Stat label="APP 2" value={latest?.app2.toFixed(1)} unit="%" /><Stat label="APP consistency" value={delta === null ? null : delta < 2 ? `CONSISTENT · Δ ${delta.toFixed(2)}%` : `CHECK · Δ ${delta.toFixed(2)}%`} /></div>
  <div className="grid gap-4 xl:grid-cols-2">{GROUPS.map(g=><Panel key={g.title} title={g.title} kind="measured"><Plot samples={win} channels={g.channels} height={155} markers={markers} /></Panel>)}</div>
</div>; }