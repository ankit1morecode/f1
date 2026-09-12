import { createFileRoute } from "@tanstack/react-router";
import { TrackMap } from "@/components/race/TrackMap";
import { CircuitPicker } from "@/components/race/CircuitPicker";
import { Plot, windowSamples } from "@/components/telemetry/Plot";
import { Panel, Stat } from "@/components/ui/Panel";
import { useTelemetry, useTrackData } from "@/lib/telemetry/useTelemetry";
import { circuitById } from "@/lib/telemetry/circuits";
import { engine } from "@/lib/telemetry/engine";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Circuits — SlipStream-X" },
      {
        name: "description",
        content:
          "Follow track position, sectors and turn-by-turn state driven by the supplied 24 Hz Silverstone dataset.",
      },
      { property: "og:title", content: "Circuits — SlipStream-X" },
      {
        property: "og:description",
        content: "Live car position, sectors, turns and events in one synchronized session.",
      },
    ],
  }),
  component: TrackPage,
});

function TrackPage() {
  const { track, latest, history, events, connection, dataStatus, dataError, paceScale } =
    useTelemetry();
  const meta = useTrackData();
  const circuit = circuitById(track.circuitId);
  const measured = connection.source === "measured";

  return (
    <div className="space-y-4">
      <header>
        <span className="label-xs text-primary">
          {measured ? "Supplied 24 Hz dataset" : "Behavioural model"}
        </span>
        <h1 className="font-display text-3xl font-bold">{circuit.name}</h1>
        <p className="text-sm text-muted-foreground">
          {circuit.country} · {circuit.lapKm.toFixed(3)} km · {circuit.corners} corners.{" "}
          {circuit.note}
        </p>
      </header>

      {dataStatus === "error" && (
        <Panel title="Dataset unavailable">
          <p className="text-sm text-crit">{dataError}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Silverstone telemetry is served from MongoDB. Start mongod, then run{" "}
            <span className="num text-primary">npm run seed</span>.
          </p>
        </Panel>
      )}

      <Panel title="Choose a circuit">
        <CircuitPicker activeId={track.circuitId} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
        <Panel
          title={measured ? "Track position — supplied GPS" : "Live track position"}
          actions={
            measured && meta ? (
              <label className="flex items-center gap-2">
                <span className="label-xs">Jump to lap</span>
                <select
                  aria-label="Jump to lap"
                  value={track.lap}
                  onChange={(event) => engine.seekToLap(Number(event.target.value))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {meta.laps.map((lap) => (
                    <option key={lap.lap} value={lap.lap}>
                      Lap {lap.lap}
                    </option>
                  ))}
                </select>
              </label>
            ) : undefined
          }
        >
          <TrackMap track={track} events={events} />
          {measured && meta && (
            <p className="mt-3 text-xs text-muted-foreground">
              Source: {meta.source.frames} · {meta.samplingHz} samples per second ·{" "}
              {meta.frameCount.toLocaleString()} frames across {meta.lapCount} laps, stored in
              MongoDB.
              {paceScale > 1.01 && (
                <>
                  {" "}
                  Recorded at {meta.lapDurationS.toFixed(0)} s per lap and replayed at{" "}
                  <span className="num text-primary">{paceScale.toFixed(2)}×</span> for true race
                  pace ({(meta.lapDurationS / paceScale).toFixed(0)} s/lap); speed and wheel
                  rotation scale with it, accelerations with its square.
                </>
              )}
            </p>
          )}
        </Panel>

        <div className="grid grid-cols-2 content-start gap-3">
          <Stat
            label="Lap"
            value={meta && measured ? `${track.lap} / ${meta.lapCount}` : track.lap}
          />
          <Stat label="Sector" value={track.sector} />
          <Stat label="Progress" value={(track.progress * 100).toFixed(1)} unit="%" />
          <Stat label="Speed" value={latest?.speed.toFixed(1)} unit="km/h" />
          <Stat label="Lap length" value={circuit.lapKm.toFixed(3)} unit="km" />
          <Stat label="Distance" value={(track.distanceKm * 1000).toFixed(0)} unit="m" />
          {measured && (
            <>
              <Stat
                label="Active turn"
                value={track.activeTurn || "Straight"}
                hint={track.activeTurn ? track.turnPhase : "Between turns"}
              />
              <Stat label="Elapsed" value={((latest?.t ?? 0) / 1000).toFixed(2)} unit="s" />
              <Stat label="Longitudinal" value={latest?.ax.toFixed(2)} unit="g" />
              <Stat label="Lateral" value={latest?.ay.toFixed(2)} unit="g" />
              <Stat label="Front steer" value={latest?.steer.toFixed(2)} unit="°" />
              <Stat label="Front brake" value={latest?.brakeFront.toFixed(1)} unit="bar" />
            </>
          )}
        </div>
      </div>

      {measured && meta && (
        <Panel title="Stint progression — per-lap rollups computed in MongoDB" kind="measured">
          <LapTable laps={meta.laps} current={track.lap} />
        </Panel>
      )}

      <Panel title="Speed profile and braking points">
        <Plot
          samples={windowSamples(history, 60000)}
          channels={["speed", "brakeFront", "brakeRear"]}
          height={220}
          markers={events
            .filter((e) => e.category === "PIT" || e.category === "TRACK")
            .map((e) => ({ t: e.t, severity: e.severity }))}
          windowMs={60000}
        />
      </Panel>
    </div>
  );
}

function LapTable({
  laps,
  current,
}: {
  laps: {
    lap: number;
    avgSpeedKmh: number;
    maxSpeedKmh: number;
    maxTireTempC: number;
    avgTirePressureBar: number;
    peakBrakeBar: number;
  }[];
  current: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="label-xs py-2 font-normal">Lap</th>
            <th className="label-xs py-2 font-normal">Avg speed</th>
            <th className="label-xs py-2 font-normal">Max speed</th>
            <th className="label-xs py-2 font-normal">Peak tire temp</th>
            <th className="label-xs py-2 font-normal">Avg pressure</th>
            <th className="label-xs py-2 font-normal">Peak brake</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap) => (
            <tr
              key={lap.lap}
              className={
                lap.lap === current
                  ? "border-b border-border bg-primary/5 text-primary"
                  : "border-b border-border/60"
              }
            >
              <td className="num py-1.5">{lap.lap}</td>
              <td className="num py-1.5">{lap.avgSpeedKmh.toFixed(2)} km/h</td>
              <td className="num py-1.5">{lap.maxSpeedKmh.toFixed(2)} km/h</td>
              <td className="num py-1.5">{lap.maxTireTempC.toFixed(2)} °C</td>
              <td className="num py-1.5">{lap.avgTirePressureBar.toFixed(3)} bar</td>
              <td className="num py-1.5">{lap.peakBrakeBar.toFixed(2)} bar</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
