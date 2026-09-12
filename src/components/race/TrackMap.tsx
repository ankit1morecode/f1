import { useMemo } from "react";
import type { TelemetryEvent, TrackState } from "@/lib/telemetry/types";
import { circuitById } from "@/lib/telemetry/circuits";
import { useTrackData } from "@/lib/telemetry/useTelemetry";
import type { TelemetryMetaPayload } from "@/lib/telemetry/frames";

export function TrackMap({ track, events = [] }: { track: TrackState; events?: TelemetryEvent[] }) {
  const meta = useTrackData();
  const circuit = circuitById(track.circuitId);

  // The supplied circuit draws from real GPS; the rest use their stored outline.
  if (meta && meta.circuitId === circuit.id && meta.racingLine.length > 1) {
    return <SuppliedTrackMap meta={meta} track={track} />;
  }
  return <OutlineTrackMap track={track} events={events} />;
}

/* ---------- circuits with a supplied GPS trace ---------- */

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 760;
const MAP_PADDING = 64;

function SuppliedTrackMap({ meta, track }: { meta: TelemetryMetaPayload; track: TrackState }) {
  const geometry = useMemo(() => {
    const { minX, maxX, minY, maxY } = meta.gpsBounds;
    const scale = Math.min(
      (MAP_WIDTH - MAP_PADDING * 2) / Math.max(1, maxX - minX),
      (MAP_HEIGHT - MAP_PADDING * 2) / Math.max(1, maxY - minY),
    );
    const offsetX = (MAP_WIDTH - (maxX - minX) * scale) / 2;
    const offsetY = (MAP_HEIGHT - (maxY - minY) * scale) / 2;
    const project = (x: number, y: number) => ({
      x: offsetX + (x - minX) * scale,
      y: offsetY + (maxY - y) * scale,
    });

    const points = meta.racingLine.map(([x, y, sector, distanceM]) => ({
      ...project(x, y),
      sector,
      distanceM,
    }));
    const fullLine = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    // Split into contiguous same-sector runs rather than filtering by sector
    // value. Filtering collects points from anywhere in the lap, and a polyline
    // joins them in order — so a sector that appears twice draws a straight
    // line across the infield between the two occurrences.
    const segments: { sector: number; points: typeof points }[] = [];
    for (const point of points) {
      const last = segments[segments.length - 1];
      if (last && last.sector === point.sector) last.points.push(point);
      else segments.push({ sector: point.sector, points: [point] });
    }
    // Start each run at the previous run's last point so the seams have no gap.
    for (let i = 1; i < segments.length; i++) {
      const previous = segments[i - 1]!.points;
      segments[i]!.points.unshift(previous[previous.length - 1]!);
    }
    const sectorLines = segments.map((segment) => ({
      sector: segment.sector,
      points: segment.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
    }));

    // Place each turn at the racing-line point closest to its real lap distance,
    // and take the local tangent so the cut line sits across the track.
    const turnCuts = meta.turns.map((turn) => {
      let index = 0;
      let best = Infinity;
      points.forEach((point, i) => {
        const gap = Math.abs(point.distanceM - turn.distanceM);
        if (gap < best) {
          best = gap;
          index = i;
        }
      });
      const center = points[index]!;
      const before = points[Math.max(0, index - 6)]!;
      const after = points[Math.min(points.length - 1, index + 6)]!;
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      return { ...turn, x: center.x, y: center.y, nx: -dy / length, ny: dx / length };
    });

    return { project, fullLine, sectorLines, turnCuts };
  }, [meta]);

  const marker = geometry.project(track.gpsX, track.gpsY);

  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[760px] overflow-hidden rounded-lg bg-carbon p-2 sm:p-4">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label={`${meta.track}: lap ${track.lap}, sector ${track.sector}, ${
          track.activeTurn ? `turn ${track.activeTurn}` : "between turns"
        }`}
      >
        <polyline
          points={geometry.fullLine}
          fill="none"
          stroke="var(--carbon-soft)"
          strokeWidth="22"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {geometry.sectorLines.map((segment, index) => (
          <polyline
            key={index}
            points={segment.points}
            fill="none"
            stroke={`var(--sector-${["one", "two", "three"][segment.sector - 1] ?? "one"})`}
            strokeWidth={track.sector === segment.sector ? 10 : 8}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polyline
          points={geometry.fullLine}
          fill="none"
          stroke="var(--carbon-foreground)"
          strokeOpacity="0.48"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          vectorEffect="non-scaling-stroke"
        />
        {geometry.turnCuts.map((turn) => {
          const active = track.activeTurn === turn.number;
          const half = active ? 13 : 10;
          return (
            <g
              key={turn.number}
              aria-label={`Turn ${turn.number}, ${turn.direction === "R" ? "right" : "left"}`}
            >
              <line
                x1={turn.x - turn.nx * half}
                y1={turn.y - turn.ny * half}
                x2={turn.x + turn.nx * half}
                y2={turn.y + turn.ny * half}
                stroke={active ? "var(--primary-foreground)" : "var(--primary)"}
                strokeWidth={active ? 5 : 3}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={turn.x}
                cy={turn.y}
                r={active ? 8 : 5.5}
                fill="var(--primary)"
                stroke="var(--carbon)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={turn.x + turn.nx * 23}
                y={turn.y + turn.ny * 23}
                fill="var(--carbon-foreground)"
                fontSize="17"
                fontFamily="var(--font-mono)"
                fontWeight={active ? 700 : 500}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {turn.number}
              </text>
            </g>
          );
        })}
        <circle
          cx={marker.x}
          cy={marker.y}
          r="13"
          fill="var(--primary)"
          stroke="var(--carbon-foreground)"
          strokeWidth="4"
          vectorEffect="non-scaling-stroke"
          className="drop-shadow-md"
        />
        <circle
          cx={marker.x}
          cy={marker.y}
          r="22"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeOpacity="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute left-3 top-3 rounded-md border border-carbon-soft bg-carbon/90 px-3 py-2 text-carbon-foreground sm:left-5 sm:top-5">
        <strong className="block font-display text-sm">Silverstone GP</strong>
        <span className="block text-xs text-carbon-foreground/70">
          {meta.turns.length} turn cuts · GPS from the supplied dataset
        </span>
      </div>
      <div className="absolute bottom-3 right-3 rounded-md border border-carbon-soft bg-carbon/90 px-3 py-2 text-right text-carbon-foreground sm:bottom-5 sm:right-5">
        <span className="block text-xs text-carbon-foreground/70">
          Lap {track.lap} of {meta.lapCount}
        </span>
        <span className="num text-lg font-semibold">{(track.progress * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

/* ---------- circuits rendered from a stored outline ---------- */

function OutlineTrackMap({ track, events }: { track: TrackState; events: TelemetryEvent[] }) {
  const circuit = circuitById(track.circuitId);
  const sectorEnds = [circuit.sectors[0], circuit.sectors[1], 1];
  const sectorStarts = [0, circuit.sectors[0], circuit.sectors[1]];
  const sectorColors = ["var(--sector-one)", "var(--sector-two)", "var(--sector-three)"];
  const sectorSwatches = ["bg-sector-one", "bg-sector-two", "bg-sector-three"];

  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[680px] overflow-hidden rounded-lg bg-muted/35 p-4 sm:p-7">
      <svg
        viewBox={circuit.viewBox}
        className="h-full w-full overflow-visible"
        role="img"
        aria-label={`Outline of ${circuit.name}, lap ${track.lap}, sector ${track.sector}`}
      >
        <path
          d={circuit.path}
          fill="none"
          stroke="var(--border)"
          strokeWidth="20"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {sectorEnds.map((end, i) => (
          <path
            key={i}
            d={circuit.path}
            fill="none"
            stroke={sectorColors[i]}
            strokeOpacity={i === track.sector - 1 ? 1 : 0.76}
            strokeWidth={i === track.sector - 1 ? 10 : 8}
            vectorEffect="non-scaling-stroke"
            pathLength="1"
            strokeDasharray={`${end - (sectorStarts[i] ?? 0)} ${1 - end + (sectorStarts[i] ?? 0)}`}
            strokeDashoffset={`${-(sectorStarts[i] ?? 0)}`}
            strokeLinecap="butt"
            strokeLinejoin="round"
          />
        ))}
        <path
          id={`track-line-${circuit.id}`}
          d={circuit.path}
          fill="none"
          stroke="var(--background)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeDasharray="2 7"
          strokeOpacity="0.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          r="7"
          fill="var(--primary)"
          stroke="var(--background)"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        >
          <animateMotion
            dur="0.01s"
            fill="freeze"
            keyPoints={`${track.progress};${track.progress}`}
            keyTimes="0;1"
          >
            <mpath href={`#track-line-${circuit.id}`} />
          </animateMotion>
        </circle>
      </svg>
      <div className="absolute left-3 top-3 rounded-md border border-border bg-card/90 px-3 py-2 shadow-sm sm:left-5 sm:top-5">
        <strong className="block font-display text-sm">{circuit.name}</strong>
        <span className="label-xs block">
          {circuit.country} · {circuit.lapKm.toFixed(3)} km · {circuit.corners} corners
        </span>
        <span className="label-xs block">Simulated — no supplied dataset for this circuit</span>
      </div>
      <div className="absolute bottom-2 right-2 rounded-md border border-border bg-card/90 px-3 py-2 text-right">
        <span className="label-xs block">Track progress</span>
        <span className="num text-lg font-semibold">{(track.progress * 100).toFixed(1)}%</span>
        <span className="label-xs block">
          {events.filter((e) => e.category === "PIT" || e.category === "TRACK").length} track events
        </span>
      </div>
      <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded-md border border-border bg-card/90 px-3 py-2 sm:left-5">
        {sectorColors.map((color, i) => (
          <span
            key={color}
            className={`flex items-center gap-1.5 text-xs ${
              track.sector === i + 1 ? "font-semibold text-foreground" : "text-muted-foreground"
            }`}
          >
            <span className={`h-1.5 w-5 rounded-full ${sectorSwatches[i]}`} />S{i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}
