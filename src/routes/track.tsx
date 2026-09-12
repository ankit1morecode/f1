import { createFileRoute } from "@tanstack/react-router";
import { TrackMap } from "@/components/race/TrackMap";
import { CircuitPicker } from "@/components/race/CircuitPicker";
import { Plot, windowSamples } from "@/components/telemetry/Plot";
import { Panel, Stat } from "@/components/ui/Panel";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";
import { circuitById } from "@/lib/telemetry/circuits";

export const Route = createFileRoute("/track")({ head: () => ({ meta: [
  { title: "Circuits — SlipStream-X" }, { name: "description", content: "Choose a circuit and follow speed-driven track position, sectors and synchronized race events." },
  { property: "og:title", content: "Circuits — SlipStream-X" }, { property: "og:description", content: "Five circuits, live car position, sectors and events in one synchronized session." },
] }), component: TrackPage });

function TrackPage() {
  const { track, latest, history, events } = useTelemetry();
  const circuit = circuitById(track.circuitId);
  return <div className="space-y-4">
    <header><span className="label-xs text-primary">Synchronized circuit</span><h1 className="font-display text-3xl font-bold">{circuit.name}</h1><p className="text-sm text-muted-foreground">{circuit.country} · {circuit.lapKm.toFixed(3)} km · {circuit.corners} corners. {circuit.note}</p></header>
    <Panel title="Choose a circuit"><CircuitPicker activeId={track.circuitId} /></Panel>
    <div className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
      <Panel title="Live track position"><TrackMap track={track} events={events} /></Panel>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Lap" value={track.lap} /><Stat label="Sector" value={track.sector} />
        <Stat label="Progress" value={(track.progress*100).toFixed(1)} unit="%" /><Stat label="Speed" value={latest?.speed.toFixed(1)} unit="km/h" />
        <Stat label="Lap length" value={circuit.lapKm.toFixed(3)} unit="km" /><Stat label="Surface wear" value={(circuit.abrasion*100).toFixed(0)} unit="%" kind="inferred" />
      </div>
    </div>
    <Panel title="Speed profile and braking points"><Plot samples={windowSamples(history, 60000)} channels={["speed","brakeFront","app1"]} height={220} markers={events.filter(e => e.category === "PIT" || e.category === "TRACK").map(e => ({ t:e.t, severity:e.severity }))} /></Panel>
  </div>;
}
