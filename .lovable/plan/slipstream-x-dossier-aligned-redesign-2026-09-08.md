# SlipStream-X dossier-aligned redesign

## Goal
Turn the current telemetry dashboard into the dossier’s cohesive race-engineering demonstration while preserving the established white theme, signal-red accents, calm UI, and adjustable settings.

## What will change
1. **One shared race session**
   - Extend the simulator with lap, sector, track position, four tire corners, compound/set/stint age, pit countdown/history, and live strategy output.
   - Keep session time, lap, track, environment, and telemetry history through a pit stop; reset only tire-local state when the new set becomes active.

2. **Live Race as the primary screen**
   - Replace the generic live dashboard’s first view with a top-down Formula-style car as the visual anchor.
   - Make FL, FR, RL, and RR selectable and show each corner’s steering, ride height, temperature, pressure, speed, grip, and degradation.
   - Keep current compound, set ID, stint age, overall grip/confidence, the event stream, and a prominent 10-second PIT control visible together.

3. **Track, telemetry, strategy, and session views**
   - Add a speed-driven circuit view with sectors, car position, and event/pit markers.
   - Rework telemetry into the dossier’s nine grouped variable classes and 32 physical channels, including APP1/APP2 comparison and Front/Hind Pitot readings.
   - Add a live-linked pit-strategy workspace with pit window, target lap, compound recommendation, reasons, expected outcome, and confidence.
   - Present saved runs, laps, stints, tire sets, and pit history in a dedicated Session view while retaining existing replay/export capabilities.

4. **Visual direction and navigation**
   - Use a Haas-inspired motorsport language without presenting the site as an official Haas product: white base, black technical structure, signal red, metallic greys, restrained status colors, Oxanium/Barlow/IBM Plex Mono typography.
   - Keep the user-requested underline-only navigation hover and remove competing hover treatments.
   - Replace the current navigation with Live Race, Track, Telemetry, Pit Strategy, and Session, with secondary access to health, requirements, and settings.

5. **Validation**
   - Verify the complete demonstration flow: running session → tire degradation → strategy recommendation → PIT countdown → new tire set → preserved history.
   - Check desktop and mobile layouts, route metadata, runtime errors, and the current build signal.

## Technical details
- Expand the existing TypeScript telemetry types and singleton engine rather than creating independent page-level simulations.
- Keep thresholds, units, precision, chart windows, and provenance presentation driven by the existing settings store.
- Use semantic design tokens and reusable controls throughout; no external backend is required for this simulated demonstration.
