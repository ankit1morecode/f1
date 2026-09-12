import { createFileRoute } from "@tanstack/react-router";
import { PitControl } from "@/components/race/PitControl";
import { TireAdvice } from "@/components/race/TireAdvice";
import { CircuitPicker } from "@/components/race/CircuitPicker";
import { Panel, Stat } from "@/components/ui/Panel";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";

export const Route = createFileRoute("/strategy")({
  head: () => ({
    meta: [
      { title: "Pit Strategy — SlipStream-X" },
      {
        name: "description",
        content: "Live-linked tire and pit recommendation using the current race session.",
      },
      { property: "og:title", content: "Pit Strategy — SlipStream-X" },
      {
        property: "og:description",
        content: "Pit timing, tire choice, reasoning and confidence from the live race state.",
      },
    ],
  }),
  component: StrategyPage,
});
function StrategyPage() {
  const { strategy, tires, track, pit } = useTelemetry();
  const worst = Object.values(tires.corners).sort((a, b) => b.degradation - a.degradation)[0];
  return (
    <div className="space-y-4">
      <header>
        <span className="label-xs text-primary">Live-linked race engineering</span>
        <h1 className="font-display text-3xl font-bold">Pit strategy</h1>
        <p className="text-sm text-muted-foreground">
          Every recommendation uses the same tire and track state shown on Live Race.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-lg bg-carbon p-7 text-carbon-foreground">
          <span className="label-xs text-carbon-foreground/60">Strategy call</span>
          <div className="mt-3 font-display text-3xl font-bold text-primary">
            {strategy.pitWindow === "OPEN" ? "PIT WINDOW OPEN" : strategy.pitWindow}
          </div>
          <div className="mt-2 font-display text-2xl">
            {strategy.recommendedCompound} · TARGET LAP {strategy.recommendedLap}
          </div>
          <p className="mt-5 max-w-xl text-carbon-foreground/75">
            {strategy.reason}. {strategy.expectedBenefit}.
          </p>
          <div className="mt-6 num text-xl">CONFIDENCE {strategy.confidence}%</div>
        </section>
        <Panel title="Commit strategy">
          <PitControl pit={pit} />
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Final tire recommendation" kind="inferred">
          <TireAdvice strategy={strategy} />
        </Panel>
        <Panel title="Circuit">
          <CircuitPicker activeId={track.circuitId} />
        </Panel>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Current compound" value={tires.compound} />
        <Stat label="Set / stint" value={`${tires.setId} / ${tires.stint}`} />
        <Stat label="Stint age" value={tires.stintAgeLaps} unit="laps" />
        <Stat label="Limiting corner" value={worst?.corner ?? "--"} kind="inferred" />
      </div>
      <Panel title="Recommendation factors">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.values(tires.corners).map((t) => (
            <div key={t.corner} className="border-l-2 border-primary pl-3">
              <span className="font-display font-semibold">{t.corner}</span>
              <p className="num mt-1 text-sm">{t.degradation.toFixed(1)}% degradation</p>
              <p className="text-xs text-muted-foreground">
                {t.temperature.toFixed(1)} °C · {t.grip.toFixed(1)}% grip
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
