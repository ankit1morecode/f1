# SlipStream-X — live race engineering console

A four-corner race-engineering console. On **Silverstone** every number on screen
is a frame of the supplied 24 Hz dataset, streamed out of MongoDB; the other four
circuits fall back to a behavioural model so the screens still have something to
show.

## Data

Two CSVs are ingested into MongoDB by `scripts/seed-mongo.mjs`:

| File | Contents |
| --- | --- |
| `SlipStreamX_Silverstone_FINAL_24Hz_Simulation.csv` | 104 680 rows × 39 columns — 20 laps at 24 Hz, 5 891 m and 218.04 s per lap |
| `SlipStreamX_Silverstone_FINAL_18_Turns.csv` | 18 turns with distance, direction and severity |

The stint carries a real degradation arc: tire temperatures climb from ~68 °C on
lap 1 to ~76 °C by lap 20, pressures rise 1.15 → 1.24 bar, and average lap speed
decays 100.3 → 98.1 km/h. Tire wear in the app is read off that measured rise
rather than invented.

### Pace correction

The dataset covers the 5.891 km lap in **218 s** at ~100 km/h average and 134 km/h
peak. A real F1 car laps Silverstone in ~87 s at ~245 km/h average and ~330 km/h
peak — the recording is a correctly shaped lap on a time base about 2.5× too slow.
Lap time, average speed and top speed each imply the same factor independently
(2.51 / 2.42 / 2.46), which is the signature of a uniform time-base error rather
than a different vehicle.

`TelemetryEngine.paceScale` therefore divides the dataset's own lap duration by a
target F1 lap time and replays at that rate: speed and wheel rotation scale with
k, accelerations with k² (lateral is v²/r at unchanged radius, longitudinal is
dv/dt). Distance, GPS, sector, temperature, pressure and load are geometry or
physical state and are left exactly as recorded. Because the factor is derived
from the data, it collapses to exactly 1 — a no-op — as soon as the CSV is
regenerated at true race pace, which is the better long-term fix.

Corrected accelerations are held inside a ±6 g envelope: the source speed trace
has occasional single-sample discontinuities that k² would otherwise turn into
10 g spikes.

### Instability episodes (demo data)

The supplied lap is a clean one: steering moves at most ~1° per 0.1 s and the four
wheel speeds never disagree, so the stability and slip detectors have nothing to
fire on and the race-engineer feed only ever shows lap markers.

`npm run seed:demo` writes three scripted snap-oversteer episodes per lap — one in
each third of the circuit, at the most severe turn in that third (turns 3, 11 and
15), landing about 13 s, 56 s and 73 s into each lap. Each is a 3-second
sine-enveloped event, so entry and exit stay continuous:

| phase | signal written | event raised |
| --- | --- | --- |
| rear wheels break traction | `wheelRpm.RL/RR` +15 % | Wheel slip — **warning** |
| load spikes | `latAccelG` +0.36 g | grip model falls |
| driver countersteers | `steerFrontDeg` ±9°, 2.5 cycles | Instability — **critical** |
| car is caught | envelope decays | Grip degrading — **warning** |
| load returns to normal | — | Grip recovering — **advisory** |

Every touched frame is tagged `injected: "instability"`, and the episode count and
turns are recorded on the meta document, so injected frames are always
distinguishable from the recorded measurements. `npm run seed` (without
`--instability`) restores clean data.

### Collections

| Collection | Documents | Purpose |
| --- | --- | --- |
| `silverstone_frames` | 104 680 | One document per sample. `_id` is the global frame sequence, so seeking is an indexed range scan. |
| `silverstone_turns` | 18 | Turn markers for the track map. |
| `silverstone_laps` | 20 | Per-lap rollups built with an aggregation pipeline at seed time. |
| `silverstone_meta` | 1 | Sampling rate, lap geometry, GPS bounds and a 644-point racing line. |
| `runs` | — | Saved sessions. Replaces the old `localStorage` store. |
| `driver_profiles` | — | Editable driver name, description and photo. |

## Getting started

You need Node.js and a running MongoDB (local `mongod` or an Atlas URI).

```sh
npm install
cp .env.example .env     # optional — defaults to mongodb://127.0.0.1:27017
npm run seed             # streams both CSVs into MongoDB (~104k documents)
npm run dev
```

`npm run seed` looks for the CSVs in `./data`, then the repo root, then your
Desktop. Pass explicit paths if they live elsewhere:

```sh
node scripts/seed-mongo.mjs --frames path/to/24Hz.csv --turns path/to/turns.csv --drop
```

`--drop` empties the Silverstone collections first; use `npm run seed:reset` for
the same thing. Re-seeding never touches the `runs` collection.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run seed` | Ingest the CSVs into MongoDB |
| `npm run seed:reset` | Re-ingest, dropping existing frames first |
| `npm run seed:demo` | Re-ingest with 3 instability episodes per lap |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint + Prettier |
| `npm run build` | Production build (Nitro, `node-server` preset) |

## API

All routes live in `src/routes/api/` as TanStack Start server routes.

| Route | Does |
| --- | --- |
| `GET /api/telemetry/meta` | Track geometry, 18 turns, 20 lap rollups, racing line (~20 KB) |
| `GET /api/telemetry/frames?from=&count=` | A chunk of frames in tuple encoding (~330 KB per 60 s) |
| `GET /api/imagekit/auth` | Short-lived signed ImageKit upload token |
| `GET` / `PUT /api/driver-profiles` | Read and write driver profiles |
| `GET /api/runs` | List saved runs |
| `POST /api/runs` | Save a run |
| `GET /api/runs/:runId` | Load one run with its samples |
| `DELETE /api/runs/:runId` | Delete a run |

Frames travel as plain number arrays in a fixed column order
(`src/lib/telemetry/frames.ts`) rather than as objects — repeating 39 key names
per frame would roughly triple the payload. The browser keeps a couple of
60-second chunks resident, plays them at 24 Hz, and prefetches the next one, so
the 27 MB source never reaches the client.

## Driver photos

Driver photos upload straight from the browser to [ImageKit](https://imagekit.io),
so a multi-megabyte image never passes through this server. `/api/imagekit/auth`
signs a 10-minute upload token with the private key; only the token, its expiry,
the signature and the **public** key reach the browser.

`IMAGEKIT_PRIVATE_KEY` must stay server-side — never give it a `VITE_` prefix and
never return it from an API route, or it lands in the client bundle. Avatars are
requested with ImageKit resize transformations (`?tr=w-320,h-320,fo-auto`) so the
80 px box does not download the full-resolution original.

Note: this account's upload API rejects a leading slash and hyphens in the folder
path, so uploads go to `slipstream_x/drivers`.

## Deployment

The build targets Nitro's `node-server` preset, pinned in `vite.config.ts`. The
MongoDB driver needs raw TCP sockets and Node built-ins, so this app **cannot**
run on Cloudflare Workers — the default `cloudflare-module` preset fails to
bundle `whatwg-url`. Deploy to a Node host and set `MONGODB_URI`.

## Built with

- TanStack Start · React 19 · TypeScript
- MongoDB 8
- Tailwind CSS
