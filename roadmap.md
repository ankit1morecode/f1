# Roadmap — SlipStream-X telemetry console

- [x] Parse dossier, extract requirements
- [x] Red/black design system + telemetry engine (simulated 20 Hz link)
- [x] Screens: Overview, Live telemetry, Analysis, Session replay, System health, Requirements
- [x] Recording, replay transport, CSV/JSON export
- [x] Polish UI, change typeface, remove "V2" from the product name
- [x] Expand the shared session engine to four-corner tires, track, pit, and strategy state
- [x] Redesign the main live experience around the top-view race car and tire states
- [x] Add Track, Telemetry, Pit Strategy, and Session views linked to the same run
- [x] Verify the dossier demonstration sequence and responsive layouts
- [x] Add 18 numbered Silverstone turn cuts from the supplied turn data
- [x] Drive a single live track marker and readouts from the supplied 24 Hz simulation
- [x] Replace the synthetic channel generator with the supplied 24 Hz Silverstone dataset
- [x] Ingest both CSVs into MongoDB (104,680 frames, 18 turns, 20 lap rollups)
- [x] Serve telemetry, track metadata and saved runs from TanStack Start API routes
- [x] Move saved runs from localStorage to MongoDB
- [x] Derive tire wear from measured temperature and pressure rise
- [x] Keep the behavioural model for circuits with no supplied data
