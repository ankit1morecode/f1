import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { GripCore } from "@/components/telemetry/GripCore";
import { Plot } from "@/components/telemetry/Plot";
import { VehicleZones } from "@/components/telemetry/VehicleZones";
import { Panel, Stat } from "@/components/ui/Panel";
import { deleteSession, listSessions } from "@/lib/telemetry/engine";
import type { RecordedSession } from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/replay")({
  head: () => ({
    meta: [
      { title: "Session Replay — SlipStream-X" },
      {
        name: "description",
        content:
          "Load recorded SlipStream-X runs without hardware: play, pause and seek a synchronized timeline with grip inference, dynamics and event markers.",
      },
      { property: "og:title", content: "Session Replay — SlipStream-X" },
      {
        property: "og:description",
        content:
          "Play, pause and seek recorded telemetry with synchronized plots and event markers.",
      },
    ],
  }),
  component: Replay,
});

function Replay() {
  const [sessions, setSessions] = useState<RecordedSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const raf = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const list = listSessions();
    setSessions(list);
    setActiveId(list[0]?.meta.id ?? null);
  }, []);

  const session = sessions.find((s) => s.meta.id === activeId) ?? null;
  const samples = session?.samples ?? [];
  const current = samples[Math.min(idx, samples.length - 1)] ?? null;

  useEffect(() => {
    if (raf.current) clearInterval(raf.current);
    if (!playing || !samples.length) return;
    raf.current = setInterval(() => {
      setIdx((i) => (i >= samples.length - 1 ? 0 : i + 1));
    }, 50 / speed);
    return () => {
      if (raf.current) clearInterval(raf.current);
    };
  }, [playing, speed, samples.length]);

  const markers = useMemo(
    () =>
      (session?.events ?? [])
        .filter((e) => e.severity !== "INFO")
        .map((e) => ({ t: e.t, severity: e.severity })),
    [session],
  );

  if (!sessions.length) {
    return (
      <Panel title="Session replay">
        <p className="text-sm text-muted-foreground">
          No recorded runs yet. Connect the link and press{" "}
          <span className="text-primary">Record run</span> in the top bar to store a session, then
          come back here to replay it without hardware.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="Recorded sessions">
        <ul className="grid gap-2 md:grid-cols-3">
          {sessions.map((s) => (
            <li key={s.meta.id}>
              <button
                onClick={() => {
                  setActiveId(s.meta.id);
                  setIdx(0);
                  setPlaying(false);
                }}
                className={cn(
                  "panel w-full px-3 py-2 text-left",
                  activeId === s.meta.id && "border-primary",
                )}
              >
                <span className="num block text-xs text-foreground">{s.meta.id}</span>
                <span className="label-xs block">
                  {new Date(s.meta.startedAt).toLocaleString()} ·{" "}
                  {(s.meta.durationMs / 1000).toFixed(1)} s · {s.samples.length} samples
                </span>
                <span className="label-xs block">
                  protocol v{s.meta.protocolVersion} · loss {s.meta.lossPct.toFixed(2)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={() => {
            if (!activeId) return;
            deleteSession(activeId);
            const list = listSessions();
            setSessions(list);
            setActiveId(list[0]?.meta.id ?? null);
          }}
          className="label-xs mt-3 self-start rounded-sm border border-border px-3 py-1.5"
        >
          Delete selected run
        </button>
      </Panel>

      <Panel title="Replay transport">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="label-xs rounded-sm bg-primary px-4 py-1.5 text-primary-foreground"
          >
            {playing ? "Pause" : "Play"}
          </button>
          {[0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={cn(
                "label-xs rounded-sm border px-2 py-1",
                speed === s ? "border-primary text-primary" : "border-border",
              )}
            >
              {s}×
            </button>
          ))}
          <input
            type="range"
            min={0}
            max={Math.max(0, samples.length - 1)}
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="min-w-48 flex-1 accent-primary"
          />
          <span className="num text-xs">
            {current ? (current.t / 1000).toFixed(2) : "0.00"} s /{" "}
            {((samples[samples.length - 1]?.t ?? 0) / 1000).toFixed(2)} s
          </span>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.7fr]">
        <Panel title="Grip inference at cursor" kind="inferred">
          <GripCore s={current} compact />
        </Panel>
        <Panel title="Behavioural zone at cursor" kind="inferred">
          <VehicleZones s={current} />
        </Panel>
      </div>

      <Panel title="Synchronized timeline">
        <Plot
          samples={samples}
          channels={["gripScore", "ay", "vibrationRms"]}
          height={220}
          cursorT={current?.t ?? null}
          markers={markers}
        />
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ax longitudinal" value={current?.ax.toFixed(2)} unit="g" />
        <Stat label="yaw rate" value={current?.yawRate.toFixed(1)} unit="°/s" />
        <Stat label="speed" value={current?.speed.toFixed(1)} unit="km/h" />
        <Stat
          label="confidence"
          value={current?.confidence.toFixed(0)}
          unit="%"
          kind="inferred"
        />
      </div>

      <Panel title="Events around cursor">
        <ul className="divide-y divide-border">
          {(session?.events ?? [])
            .filter((e) => Math.abs(e.t - (current?.t ?? 0)) < 6000)
            .map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 py-2">
                <span className="num w-16 text-[0.65rem] text-muted-foreground">
                  {(e.t / 1000).toFixed(1)}s
                </span>
                <span className="label-xs w-20">{e.severity}</span>
                <span className="text-xs">{e.title}</span>
                <span className="text-[0.65rem] text-muted-foreground">{e.detail}</span>
              </li>
            ))}
          {!(session?.events ?? []).some((e) => Math.abs(e.t - (current?.t ?? 0)) < 6000) && (
            <li className="label-xs py-2">no events within ±6 s of cursor</li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
