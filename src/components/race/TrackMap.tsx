import type { TelemetryEvent, TrackState } from "@/lib/telemetry/types";
import { circuitById } from "@/lib/telemetry/circuits";

export function TrackMap({ track, events = [] }: { track: TrackState; events?: TelemetryEvent[] }) {
  const circuit = circuitById(track.circuitId);
  const sectorEnds = [circuit.sectors[0], circuit.sectors[1], 1];
  return <div className="relative mx-auto aspect-[4/3] w-full max-w-[680px] overflow-hidden rounded-lg bg-muted/35 p-4 sm:p-7">
    <svg viewBox={circuit.viewBox} className="h-full w-full overflow-visible" aria-label={`Accurate outline of ${circuit.name}, lap ${track.lap}, sector ${track.sector}`}>
      <path d={circuit.path} fill="none" stroke="var(--border)" strokeWidth="18" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <path id={`track-line-${circuit.id}`} d={circuit.path} fill="none" stroke="var(--carbon)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="3 8" strokeLinecap="round" strokeLinejoin="round" />
      {sectorEnds.map((end, i) => (
        <path key={i} d={circuit.path} fill="none" stroke={i === track.sector - 1 ? "var(--primary)" : "var(--muted-foreground)"}
          strokeOpacity={i === track.sector - 1 ? 0.9 : 0.25} strokeWidth={i === track.sector - 1 ? 6 : 3}
          vectorEffect="non-scaling-stroke" pathLength="1" strokeDasharray={`${end - (i === 0 ? 0 : (sectorEnds[i - 1] ?? 0))} 1`}
          strokeDashoffset={`${-(i === 0 ? 0 : (sectorEnds[i - 1] ?? 0))}`} strokeLinecap="butt" />
      ))}
      <path d={circuit.path} fill="none" stroke="var(--primary)" strokeWidth="4" vectorEffect="non-scaling-stroke" pathLength="100" strokeDasharray={`${track.progress * 100} 100`} strokeLinecap="round" />
      <circle r="7" fill="var(--primary)" stroke="var(--background)" strokeWidth="3" vectorEffect="non-scaling-stroke">
        <animateMotion dur="0.01s" fill="freeze" keyPoints={`${track.progress};${track.progress}`} keyTimes="0;1"><mpath href={`#track-line-${circuit.id}`} /></animateMotion>
      </circle>
    </svg>
    <div className="absolute left-3 top-3 rounded-md border border-border bg-card/90 px-3 py-2 shadow-sm sm:left-5 sm:top-5">
      <strong className="block font-display text-sm">{circuit.name}</strong>
      <span className="label-xs block">{circuit.country} · {circuit.lapKm.toFixed(3)} km · {circuit.corners} corners</span>
      <a href={circuit.outlineSource} target="_blank" rel="noreferrer" className="story-link text-xs text-muted-foreground">Accurate outline source</a>
    </div>
    <div className="absolute bottom-2 right-2 rounded-md border border-border bg-card/90 px-3 py-2 text-right">
      <span className="label-xs block">Track progress</span><span className="num text-lg font-semibold">{(track.progress * 100).toFixed(1)}%</span>
      <span className="label-xs block">{events.filter((e) => e.category === "PIT" || e.category === "TRACK").length} track events</span>
    </div>
  </div>;
}
