import { createFileRoute } from "@tanstack/react-router";
import { Panel } from "@/components/ui/Panel";
import {
  DEFAULT_SETTINGS,
  resetSettings,
  updateSettings,
  useSettings,
  type Settings,
} from "@/lib/telemetry/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Thresholds & Units — SlipStream-X" },
      {
        name: "description",
        content:
          "Choose what counts as low grip, pick your units, and set how the SlipStream-X screens display numbers.",
      },
      { property: "og:title", content: "Settings — Thresholds & Units — SlipStream-X" },
      {
        property: "og:description",
        content:
          "Adjust grip bands, alert limits, units and readout preferences for the SlipStream-X console.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const s = useSettings();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Decide what counts as a warning, choose your units, and set how numbers appear. Changes
            apply straight away and are remembered on this device.
          </p>
        </div>
        <button
          onClick={resetSettings}
          className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm text-muted-foreground"
        >
          Back to defaults
        </button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="What counts as low grip" kind="inferred">
          <p className="mb-4 text-sm text-muted-foreground">
            The grip score runs from 0 to 100. Set where each band begins.
          </p>
          <div className="space-y-5">
            <Slider
              label="Good grip from"
              value={s.gripHigh}
              min={s.gripMedium + 2}
              max={100}
              unit=""
              onChange={(v) => updateSettings({ gripHigh: v })}
            />
            <Slider
              label="Fair grip from"
              value={s.gripMedium}
              min={s.gripLow + 2}
              max={s.gripHigh - 2}
              unit=""
              onChange={(v) => updateSettings({ gripMedium: v })}
            />
            <Slider
              label="Low grip from"
              value={s.gripLow}
              min={1}
              max={s.gripMedium - 2}
              unit=""
              onChange={(v) => updateSettings({ gripLow: v })}
            />
            <p className="text-sm text-muted-foreground">
              Anything below {s.gripLow} is treated as critical.
            </p>
          </div>
        </Panel>

        <Panel title="When to raise an alert">
          <div className="space-y-5">
            <Slider
              label="Warn about falling grip below"
              value={s.degradingGrip}
              min={10}
              max={95}
              unit=""
              onChange={(v) => updateSettings({ degradingGrip: v })}
            />
            <Slider
              label="Call it unstable above"
              value={s.steerRateWarn}
              min={2}
              max={80}
              step={1}
              unit="°/s steering"
              onChange={(v) => updateSettings({ steerRateWarn: v })}
            />
            <Slider
              label="…and only in corners harder than"
              value={s.latAccelWarn}
              min={0.2}
              max={5}
              step={0.1}
              unit="g sideways"
              onChange={(v) => updateSettings({ latAccelWarn: v })}
            />
            <Slider
              label="Report wheel slip above"
              value={s.wheelSlipWarn}
              min={0.2}
              max={15}
              step={0.2}
              unit="% wheel-speed gap"
              onChange={(v) => updateSettings({ wheelSlipWarn: v })}
            />
            <Slider
              label="Note a rough surface above"
              value={s.vibrationInfo}
              min={1}
              max={25}
              step={0.5}
              unit="m/s² shake"
              onChange={(v) => updateSettings({ vibrationInfo: v })}
            />
            <Slider
              label="Flag sensor disagreement below"
              value={s.confidenceWarn}
              min={20}
              max={95}
              unit="% certainty"
              onChange={(v) => updateSettings({ confidenceWarn: v })}
            />
          </div>
        </Panel>

        <Panel title="Units">
          <div className="space-y-5">
            <Choice
              label="Speed"
              value={s.speedUnit}
              options={[
                { value: "kmh", label: "km/h" },
                { value: "mph", label: "mph" },
              ]}
              onChange={(v) => updateSettings({ speedUnit: v as Settings["speedUnit"] })}
            />
            <Choice
              label="Acceleration"
              value={s.accelUnit}
              options={[
                { value: "g", label: "g" },
                { value: "ms2", label: "m/s²" },
              ]}
              onChange={(v) => updateSettings({ accelUnit: v as Settings["accelUnit"] })}
            />
            <Choice
              label="Temperature"
              value={s.tempUnit}
              options={[
                { value: "c", label: "°C" },
                { value: "f", label: "°F" },
              ]}
              onChange={(v) => updateSettings({ tempUnit: v as Settings["tempUnit"] })}
            />
          </div>
        </Panel>

        <Panel title="Display">
          <div className="space-y-5">
            <Choice
              label="Decimal places"
              value={String(s.decimals)}
              options={[
                { value: "0", label: "0" },
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
              ]}
              onChange={(v) => updateSettings({ decimals: Number(v) })}
            />
            <Choice
              label="Screen refresh"
              value={String(s.renderHz)}
              options={[
                { value: "4", label: "Calm" },
                { value: "12", label: "Normal" },
                { value: "20", label: "Fastest" },
              ]}
              onChange={(v) => updateSettings({ renderHz: Number(v) })}
            />
            <Choice
              label="Default chart window"
              value={String(s.windowMs)}
              options={[
                { value: "10000", label: "10 s" },
                { value: "30000", label: "30 s" },
                { value: "60000", label: "60 s" },
                { value: "120000", label: "120 s" },
              ]}
              onChange={(v) => updateSettings({ windowMs: Number(v) })}
            />
            <Choice
              label="Show where a number came from"
              value={s.showProvenance ? "on" : "off"}
              options={[
                { value: "on", label: "Show" },
                { value: "off", label: "Hide" },
              ]}
              onChange={(v) => updateSettings({ showProvenance: v === "on" })}
            />
            <p className="text-sm text-muted-foreground">
              Defaults: good grip from {DEFAULT_SETTINGS.gripHigh}, fair from{" "}
              {DEFAULT_SETTINGS.gripMedium}, low from {DEFAULT_SETTINGS.gripLow}.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const safeMin = Math.min(min, max);
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-foreground/90">{label}</span>
        <span className="num text-sm text-primary">
          {step < 1 ? value.toFixed(2) : Math.round(value)} {unit}
        </span>
      </span>
      <input
        type="range"
        min={safeMin}
        max={max}
        step={step}
        value={Math.max(safeMin, Math.min(max, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-primary"
      />
    </label>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="text-sm text-foreground/90">{label}</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm",
              value === o.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
