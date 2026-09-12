import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plot } from "@/components/telemetry/Plot";
import { DecisionStream } from "@/components/telemetry/DecisionStream";
import { Panel, Stat } from "@/components/ui/Panel";
import { listSessions, loadSession, sessionToCsv, type RunSummary } from "@/lib/telemetry/engine";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";
import {
  CHANNELS,
  type ChannelKey,
  type RecordedSession,
  type Sample,
} from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Analysis — SlipStream-X" },
      {
        name: "description",
        content:
          "Multi-channel plots, event markers, run comparison and documented CSV/JSON export for runs stored in MongoDB.",
      },
      { property: "og:title", content: "Analysis — SlipStream-X" },
      {
        property: "og:description",
        content: "Multi-channel plots, event markers and engineering export for recorded runs.",
      },
    ],
  }),
  component: AnalysisWorkspace,
});

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  // Firefox only starts the download for an anchor that is in the document, and
  // revoking the URL in the same tick can cancel it.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const DEFAULT_CHANNELS: ChannelKey[] = ["tireTempFL", "tireTempFR", "tireTempRL", "tireTempRR"];

function AnalysisWorkspace() {
  const live = useTelemetry(6);
  // Read after mount: the server has no access to the run list, so doing this
  // during render would make the first client paint disagree with the SSR HTML.
  const [recorded, setRecorded] = useState<RunSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string>("LIVE");
  const [channels, setChannels] = useState<ChannelKey[]>(DEFAULT_CHANNELS);
  const [compareId, setCompareId] = useState<string>("");
  const [loaded, setLoaded] = useState<Record<string, RecordedSession>>({});

  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((runs) => !cancelled && setRecorded(runs))
      .catch((error: unknown) => {
        if (!cancelled) setListError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureLoaded = useCallback(
    (runId: string) => {
      if (!runId || runId === "LIVE" || loaded[runId]) return;
      void loadSession(runId)
        .then((session) => {
          if (session) setLoaded((prev) => ({ ...prev, [runId]: session }));
        })
        .catch(() => {
          /* surfaced through the empty-plot state */
        });
    },
    [loaded],
  );

  useEffect(() => ensureLoaded(sourceId), [sourceId, ensureLoaded]);
  useEffect(() => ensureLoaded(compareId), [compareId, ensureLoaded]);

  const liveDataset: RecordedSession = useMemo(
    () => ({
      meta: live.session,
      samples: live.history,
      events: live.events,
      pitHistory: live.pit.history,
    }),
    [live],
  );

  const dataset: RecordedSession = useMemo(
    () =>
      sourceId === "LIVE"
        ? liveDataset
        : (loaded[sourceId] ?? { ...liveDataset, samples: [], events: [] }),
    [sourceId, liveDataset, loaded],
  );

  const compare = compareId ? (loaded[compareId] ?? null) : null;

  const toggle = (k: ChannelKey) =>
    setChannels((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  const stats = useMemo(() => summarize(dataset.samples), [dataset]);
  const measured = live.connection.source === "measured";

  return (
    <div className="space-y-4">
      <Panel title="Dataset">
        <div className="flex flex-wrap items-end gap-4">
          <Select
            label="Primary dataset"
            value={sourceId}
            onChange={setSourceId}
            options={[
              { value: "LIVE", label: `LIVE buffer · ${live.session.id}` },
              ...recorded.map((r) => ({
                value: r.runId,
                label: `${r.runId} · ${(r.durationMs / 1000).toFixed(0)} s · ${r.circuitId}`,
              })),
            ]}
          />
          <Select
            label="Compare with run"
            value={compareId}
            onChange={setCompareId}
            options={[
              { value: "", label: "none" },
              ...recorded.map((r) => ({ value: r.runId, label: r.runId })),
            ]}
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => download(`${dataset.meta.id}.csv`, sessionToCsv(dataset), "text/csv")}
              className="label-xs rounded-sm bg-primary px-3 py-1.5 text-primary-foreground"
            >
              Export CSV
            </button>
            <button
              onClick={() =>
                download(
                  `${dataset.meta.id}.json`,
                  JSON.stringify(dataset, null, 2),
                  "application/json",
                )
              }
              className="label-xs rounded-sm border border-border px-3 py-1.5"
            >
              Export JSON
            </button>
          </div>
          <p className="label-xs ml-auto">
            software {dataset.meta.softwareVersion} · protocol v{dataset.meta.protocolVersion} ·{" "}
            {dataset.samples.length} samples · {dataset.meta.source}
          </p>
        </div>
        {listError && (
          <p className="mt-3 text-xs text-crit">
            Could not reach the run store: {listError}. Runs are saved in MongoDB — check that it is
            running.
          </p>
        )}
      </Panel>

      <Panel title="Measured channel groups">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Vehicle speed" value={live.latest?.speed.toFixed(1)} unit="km/h" />
          <Stat
            label="Wheel slip"
            value={live.latest?.wheelSlip.toFixed(2)}
            unit="%"
            kind="derived"
          />
          <Stat
            label="Front wing pressure"
            value={live.latest?.wingPressureFront.toFixed(2)}
            unit="kPa"
          />
          <Stat
            label="Rear wing pressure"
            value={live.latest?.wingPressureRear.toFixed(2)}
            unit="kPa"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              onClick={() => toggle(c.key)}
              className={cn(
                "label-xs rounded-full border px-2.5 py-1",
                channels.includes(c.key) ? "border-primary text-primary" : "border-border",
              )}
            >
              {c.label}
              {c.unit ? ` [${c.unit}]` : ""}
            </button>
          ))}
        </div>
        {measured && (
          <p className="mt-3 text-xs text-muted-foreground">
            Live channels are frames of the supplied Silverstone dataset, replayed from MongoDB.
          </p>
        )}
      </Panel>

      <Panel title={`Multi-channel plot — ${dataset.meta.id}`}>
        <Plot
          samples={dataset.samples}
          channels={channels.length ? channels : ["gripScore"]}
          height={240}
          markers={dataset.events
            .filter((e) => e.severity !== "INFO")
            .map((e) => ({ t: e.t, severity: e.severity }))}
        />
      </Panel>

      {compare && (
        <Panel title={`Comparison run — ${compare.meta.id}`}>
          <Plot
            samples={compare.samples}
            channels={channels.length ? channels : ["gripScore"]}
            height={200}
          />
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Mean grip score" value={stats.meanGrip} kind="inferred" />
        <Stat label="Min grip score" value={stats.minGrip} kind="inferred" />
        <Stat label="Peak lateral" value={stats.peakAy} unit="g" />
        <Stat label="Peak vibration RMS" value={stats.peakVib} unit="m/s²" kind="derived" />
      </div>

      <Panel title="Event log for this dataset">
        <DecisionStream events={dataset.events} maxHeight={300} />
      </Panel>
    </div>
  );
}

function summarize(samples: Sample[]) {
  if (!samples.length) return { meanGrip: null, minGrip: null, peakAy: null, peakVib: null };
  const grips = samples.map((s) => s.gripScore);
  return {
    meanGrip: (grips.reduce((a, b) => a + b, 0) / grips.length).toFixed(1),
    minGrip: Math.min(...grips).toFixed(1),
    peakAy: Math.max(...samples.map((s) => Math.abs(s.ay))).toFixed(2),
    peakVib: Math.max(...samples.map((s) => s.vibrationRms)).toFixed(2),
  };
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="label-xs block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="num mt-1 rounded-sm border border-border bg-secondary px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
