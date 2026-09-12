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
    title: "Supplied data",
    items: [
      [
        "Use the supplied 24 Hz Silverstone dataset",
        "104,680 frames across 20 laps seeded into MongoDB and replayed frame by frame",
      ],
      [
        "Use the supplied 18-turn reference",
        "Turn distance, direction and severity drive the turn markers on the track map",
      ],
      [
        "Real degradation, not invented wear",
        "Tire wear is read off the measured temperature and pressure rise since the stint began",
      ],
      [
        "Channels the dataset lacks are absent",
        "Accelerator-pedal position, vertical accel and yaw rate are not shown rather than fabricated",
      ],
      [
        "Circuits without supplied data stay usable",
        "Monza, Spa, Monaco and Suzuka fall back to the behavioural model, labelled as simulated",
      ],
    ],
  },
  {
    title: "Persistence",
    items: [
      ["Runs survive the browser", "Saved runs are documents in the MongoDB `runs` collection"],
      [
        "Per-lap analytics computed in the database",
        "An aggregation pipeline builds the 20 lap rollups at seed time",
      ],
      [
        "Frames are addressable and seekable",
        "`_id` is the global frame sequence, so a lap jump is an indexed range scan",
      ],
      [
        "Track outline without shipping the dataset",
        "A 655-point racing line and GPS bounds ride on the metadata document",
      ],
      ["Bounded payloads", "Frames travel as tuples in 60-second chunks, ~330 KB each"],
    ],
  },
  {
    title: "Race session and navigation",
    items: [
      [
        "One coherent session state",
        "A singleton engine feeds vehicle, tires, track, pit, strategy and history",
      ],
      ["Live Race", "Top-view car, four tires, current set, grip, decisions, PIT and track"],
      ["Track", "GPS position, lap, sectors, turn state and per-lap stint progression"],
      ["Telemetry", "Grouped panels covering every measured channel in the dataset"],
      ["Pit Strategy", "Live pit window, target lap, compound, reasoning and confidence"],
      ["Session", "Saved runs, synchronized replay, events and exports"],
    ],
  },
  {
    title: "Four-corner tire model",
    items: [
      ["FL / FR / RL / RR identifiable", "Selectable, labeled tire blocks around the top-view car"],
      [
        "Corner variables",
        "Steering, ride height, temperature, pressure, wheel speed, grip and degradation",
      ],
      ["Status colours", "Optimal, degrading, high degradation and critical state colours"],
      ["Current tire set always visible", "Compound, set ID and stint age in the Live Race header"],
      ["Configurable grip meaning", "Threshold and unit settings remain live across views"],
    ],
  },
  {
    title: "Pit and persistence",
    items: [
      ["PIT registers a request", "The race engineer feed records PIT REQUESTED"],
      [
        "Randomised 5-10 second active countdown",
        "Counted on the session clock, so pausing does not fast-forward the stop",
      ],
      [
        "New tire state",
        "The wear baseline rebases to the measured temperature and pressure at the stop",
      ],
      ["Global state preserved", "Session time, lap, circuit, events and telemetry remain"],
      ["Visible stint history", "Pit markers remain on plots and old set metadata is stored"],
    ],
  },
  {
    title: "Architecture & performance",
    items: [
      [
        "Protocol code independent of UI",
        "Transport → decoder → validator → state store → visual model",
      ],
      ["Rendering decoupled from sample rate", "24 Hz acquisition, ~12 Hz UI sampling"],
      ["Bounded live history memory", "120-second ring buffer, mutated in place"],
      ["Monotonic session clock", "Time comes from the tick counter, so pausing leaves no gap"],
      ["Typed internal models", "A single typed telemetry contract shared by client and server"],
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
          Extracted from the SlipStream-X software and telemetry display dossier. The left column is
          the dossier requirement; the right column is where this build satisfies it. Hardware
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
