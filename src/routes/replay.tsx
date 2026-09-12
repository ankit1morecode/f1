import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripCore } from "@/components/telemetry/GripCore";
import { Plot } from "@/components/telemetry/Plot";
import { VehicleZones } from "@/components/telemetry/VehicleZones";
import { Panel, Stat } from "@/components/ui/Panel";
import { deleteSession, listSessions, loadSession, type RunSummary } from "@/lib/telemetry/engine";
import type { RecordedSession } from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/replay")({
  head: () => ({
    meta: [
      { title: "Session Replay — SlipStream-X" },
      {
        name: "description",
        content:
          "Load runs stored in MongoDB: play, pause and seek a synchronized timeline with grip inference, dynamics and event markers.",
      },
      { property: "og:title", content: "Session Replay — SlipStream-X" },
      {
        property: "og:description",
        content: "Play, pause and seek recorded telemetry with synchronized plots and markers.",
      },
    ],
  }),
  component: Replay,
});

function Replay() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<RecordedSession | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listSessions();
      setRuns(list);
      setStatus(list.length ? "ready" : "empty");
      setActiveId((current) => current ?? list[0]?.runId ?? null);
      return list;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
      return [];
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeId) {
      setSession(null);
      return;
    }
    let cancelled = false;
    setIdx(0);
    setPlaying(false);
    void loadSession(activeId)
      .then((loadedSession) => !cancelled && setSession(loadedSession))
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const samples = useMemo(() => session?.samples ?? [], [session]);
  const current = samples[Math.min(idx, samples.length - 1)] ?? null;

  useEffect(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    if (!playing || !samples.length) return;
    // Saved runs are downsampled, so step the cursor at the run's own spacing.
    const stepMs = samples.length > 1 ? samples[1]!.t - samples[0]!.t || 50 : 50;
    ticker.current = setInterval(
      () => setIdx((i) => (i >= samples.length - 1 ? 0 : i + 1)),
      Math.max(16, stepMs / speed),
    );
    return () => {
      if (ticker.current) clearInterval(ticker.current);
      ticker.current = null;
    };
  }, [playing, speed, samples]);

  const markers = useMemo(
    () =>
      (session?.events ?? [])
        .filter((e) => e.severity !== "INFO")
        .map((e) => ({ t: e.t, severity: e.severity })),
    [session],
  );

  if (status === "loading") {
    return (
      <Panel title="Session replay">
        <p className="text-sm text-muted-foreground">Loading saved runs from MongoDB…</p>
      </Panel>
    );
  }

  if (status === "error") {
    return (
      <Panel title="Session replay">
        <p className="text-sm text-crit">Could not reach the run store: {error}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Runs are stored in MongoDB. Check that mongod is running, then seed the dataset with{" "}
          <span className="num text-primary">npm run seed</span>.
        </p>
      </Panel>
    );
  }

  if (status === "empty") {
    return (
      <Panel title="Session replay">
        <p className="text-sm text-muted-foreground">
          No saved runs yet. Press <span className="text-primary">Save run</span> in the top bar to
          store the current session in MongoDB, then come back here to replay it.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="Saved runs — stored in MongoDB">
        <ul className="grid gap-2 md:grid-cols-3">
          {runs.map((r) => (
            <li key={r.runId}>
              <button
                onClick={() => setActiveId(r.runId)}
                className={cn(
                  "panel w-full px-3 py-2 text-left",
                  activeId === r.runId && "border-primary",
                )}
              >
                <span className="num block text-xs text-foreground">{r.runId}</span>
                <span className="label-xs block">
                  {new Date(r.startedAt).toLocaleString()} · {(r.durationMs / 1000).toFixed(1)} s ·{" "}
                  {r.sampleCount} samples
                </span>
                <span className="label-xs block">
                  {r.circuitId} · {r.driverName} · {r.compound}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={async () => {
            if (!activeId) return;
            await deleteSession(activeId);
            setActiveId(null);
            const list = await refresh();
            setActiveId(list[0]?.runId ?? null);
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
            aria-label="Seek within the run"
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
        <Stat label="Longitudinal accel" value={current?.ax.toFixed(2)} unit="g" />
        <Stat label="Wheel slip" value={current?.wheelSlip.toFixed(2)} unit="%" kind="derived" />
        <Stat label="Speed" value={current?.speed.toFixed(1)} unit="km/h" />
        <Stat label="Confidence" value={current?.confidence.toFixed(0)} unit="%" kind="inferred" />
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
