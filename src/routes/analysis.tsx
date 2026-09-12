import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plot } from "@/components/telemetry/Plot";
import { DecisionStream } from "@/components/telemetry/DecisionStream";
import { Panel, Stat } from "@/components/ui/Panel";
import { listSessions, sessionToCsv } from "@/lib/telemetry/engine";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";
import { CHANNELS, type ChannelKey, type RecordedSession, type Sample } from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Analysis — SlipStream-X" },
      {
        name: "description",
        content:
          "Multi-channel plots, event markers, cursor inspection, run comparison and documented CSV/JSON export for recorded SlipStream-X sessions.",
      },
      { property: "og:title", content: "Analysis — SlipStream-X" },
      {
        property: "og:description",
        content:
          "Multi-channel plots, event markers, cursor inspection and engineering export for recorded runs.",
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
  a.click();
  URL.revokeObjectURL(url);
}

export function AnalysisWorkspace() {
  const live = useTelemetry(6);
  const recorded = useMemo(() => listSessions(), []);
  const [sourceId, setSourceId] = useState<string>("LIVE");
  const [channels, setChannels] = useState<ChannelKey[]>(["tireTempFL", "tireTempFR", "tireTempRL", "tireTempRR"]);
  const [compareId, setCompareId] = useState<string>("");

  const dataset: RecordedSession = useMemo(() => {
    if (sourceId === "LIVE")
      return { meta: live.session, samples: live.history, events: live.events };
    return (
      recorded.find((r) => r.meta.id === sourceId) ?? {
        meta: live.session,
        samples: [],
        events: [],
      }
    );
  }, [sourceId, live, recorded]);

  const compare = recorded.find((r) => r.meta.id === compareId) ?? null;

  const toggle = (k: ChannelKey) =>
    setChannels((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  const stats = useMemo(() => summarize(dataset.samples), [dataset]);

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
                value: r.meta.id,
                label: `${r.meta.id} · ${(r.meta.durationMs / 1000).toFixed(0)} s`,
              })),
            ]}
          />
          <Select
            label="Compare with run"
            value={compareId}
            onChange={setCompareId}
            options={[
              { value: "", label: "none" },
              ...recorded.map((r) => ({ value: r.meta.id, label: r.meta.id })),
            ]}
          />
          <div className="flex gap-1.5">
            <button
              onClick={() =>
                download(`${dataset.meta.id}.csv`, sessionToCsv(dataset), "text/csv")
              }
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
            {dataset.samples.length} samples
          </p>
        </div>
      </Panel>

      <Panel title="Nine variable classes · 32 physical channels">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="APP cross-check" value={live.latest ? Math.abs(live.latest.app1-live.latest.app2).toFixed(2) : null} unit="% delta" />
          <Stat label="APP consistency" value={live.latest && Math.abs(live.latest.app1-live.latest.app2) < 2 ? "CONSISTENT" : "CHECK"} />
          <Stat label="Front Pitot" value={live.latest?.pitotFront.toFixed(2)} unit="kPa" />
          <Stat label="Hind Pitot" value={live.latest?.pitotHind.toFixed(2)} unit="kPa" />
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
  if (!samples.length)
    return { meanGrip: null, minGrip: null, peakAy: null, peakVib: null };
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
