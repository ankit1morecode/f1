import { createFileRoute } from "@tanstack/react-router";
import { Panel } from "@/components/ui/Panel";

export const Route = createFileRoute("/requirements")({
  head: () => ({
    meta: [
      { title: "Requirements Traceability — SlipStream-X" },
      {
        name: "description",
        content:
          "Requirements extracted from the SlipStream-X software and telemetry display dossier, mapped to the screens that satisfy each one.",
      },
      { property: "og:title", content: "Requirements Traceability — SlipStream-X" },
      {
        property: "og:description",
        content:
          "Dossier requirements mapped to the delivered screens, data contract and acceptance criteria.",
      },
    ],
  }),
  component: Requirements,
});

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Race session and navigation",
    items: [
      ["One coherent session state", "A singleton race engine feeds vehicle, tires, track, pit, strategy and history"],
      ["Live Race", "Top-view car, four tires, current set, grip, decisions, PIT and track"],
      ["Track", "Speed-driven progress, lap, sectors and synchronized event history"],
      ["Telemetry", "Nine grouped panels covering all 32 physical measurement channels"],
      ["Pit Strategy", "Live pit window, target lap, compound, reasoning and confidence"],
      ["Session", "Saved runs, synchronized replay, events and exports"],
    ],
  },
  {
    title: "Four-corner tire model",
    items: [
      ["FL / FR / RL / RR identifiable", "Selectable, labeled tire blocks around the top-view car"],
      ["Corner variables", "Steering, ride height, temperature, pressure, speed, grip and degradation"],
      ["Status colours", "Optimal, degrading, high degradation and critical state colours"],
      ["Current tire set always visible", "Compound, set ID and stint age in the Live Race header"],
      ["Configurable grip meaning", "Existing threshold and unit settings remain live across views"],
    ],
  },
  {
    title: "Pit and persistence",
    items: [
      ["PIT registers a request", "The race engineer feed records PIT REQUESTED"],
      ["10-second active countdown", "Live telemetry and circuit movement continue during service"],
      ["New tire state", "Temperature, pressure, grip, degradation and age rebase on completion"],
      ["Global state preserved", "Session time, lap, circuit, environment, events and telemetry remain"],
      ["Visible stint history", "Pit markers remain on plots and old set metadata is stored"],
    ],
  },
  {
    title: "Authoritative telemetry",
    items: [
      ["32 physical channels", "4 steering + 4 ride height + 4 tire temp + 2 APP + 2 brake + 4 pressure + 2 Pitot + 2 axle load + 4 speed"],
      ["APP cross-verification", "APP1, APP2, delta and consistency status are shown together"],
      ["Pitot remains environmental", "Front and Hind Pitot have a separate air-pressure group"],
      ["Synchronized cursor and markers", "Grouped charts share timestamps and retain pit boundaries"],
      ["Measured values stay explicit", "Units and provenance appear on engineering quantities"],
    ],
  },
  {
    title: "Recording, replay & export",
    items: [
      ["Unique session identity and metadata", "Run ID, profile, protocol and software versions, duration"],
      ["Record telemetry needed for reconstruction", "Bounded ring buffer captured on Record run"],
      ["Play / pause / seek with synchronized cursor", "Replay transport with 0.5×–4× speed"],
      ["Compare runs on common variables", "Comparison run overlay in Analysis"],
      ["Documented CSV / JSON export", "Header carries session, protocol and software versions"],
    ],
  },
  {
    title: "Architecture & performance",
    items: [
      ["Protocol code independent of UI", "Transport → decoder → validator → state store → visual model"],
      ["Rendering decoupled from packet rate", "20 Hz acquisition, ~12 Hz UI sampling"],
      ["Bounded live history memory", "Fixed 120 s sample ring buffer"],
      ["Typed internal models, versioned adapter", "Single typed telemetry contract module"],
      ["Usable when optional channels absent", "Every panel degrades to NO DATA independently"],
    ],
  },
];

function Requirements() {
  return (
    <div className="space-y-4">
      <Panel>
        <h1 className="font-display text-2xl">
          Requirements <span className="text-primary">traceability</span>
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Extracted from the SlipStream-X software and telemetry display dossier. The left column
          is the dossier requirement; the right column is where this build satisfies it. Hardware
          measurement, timestamping and inference stay firmware-owned — this application only
          decodes, validates, visualizes, records and analyses.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <Panel key={g.title} title={g.title}>
            <ul className="divide-y divide-border">
              {g.items.map(([req, impl]) => (
                <li key={req} className="grid gap-1 py-2.5 sm:grid-cols-2 sm:gap-4">
                  <span className="text-xs text-foreground">{req}</span>
                  <span className="text-xs text-muted-foreground">{impl}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}
