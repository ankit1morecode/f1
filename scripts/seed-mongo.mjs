/**
 * Streams the supplied SlipStream-X Silverstone CSVs into MongoDB.
 *
 *   node scripts/seed-mongo.mjs --drop
 *
 * Flags
 *   --frames <path>  24 Hz simulation CSV   (default: ./data/...24Hz_Simulation.csv)
 *   --turns  <path>  18-turn reference CSV  (default: ./data/...18_Turns.csv)
 *   --uri    <uri>   Mongo connection URI   (default: $MONGODB_URI or localhost)
 *   --db     <name>  Database name          (default: $MONGODB_DB or slipstream-x)
 *   --drop           Empty the target collections before inserting
 *
 * The frame CSV is ~27 MB / 104 680 rows, so it is read line by line and pushed
 * in bulk batches rather than parsed into one array.
 */
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import os from "node:os";
import { MongoClient } from "mongodb";

const BATCH_SIZE = 5000;
/** Points kept for the pre-computed racing line stored on the meta document. */
const RACING_LINE_POINTS = 600;

const DEFAULTS = {
  frames: "SlipStreamX_Silverstone_FINAL_24Hz_Simulation.csv",
  turns: "SlipStreamX_Silverstone_FINAL_18_Turns.csv",
};

function parseArgs(argv) {
  const args = { drop: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--drop") args.drop = true;
    else if (key.startsWith("--")) args[key.slice(2)] = argv[++i];
  }
  return args;
}

/** Looks in ./data, then the repo root, then the user's Desktop. */
function resolveCsv(explicit, filename, label) {
  const candidates = explicit
    ? [path.resolve(explicit)]
    : [
        path.resolve("data", filename),
        path.resolve(filename),
        path.join(os.homedir(), "Desktop", filename),
      ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find the ${label} CSV. Looked in:\n  ${candidates.join("\n  ")}\n` +
        `Pass an explicit path with --${label} <file>.`,
    );
  }
  return found;
}

/** Minimal CSV splitter — these files carry no quoted fields or embedded commas. */
function splitRow(line) {
  return line.split(",");
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Builds one frame document. Corner-keyed groups mirror the app's
 * `Record<Corner, …>` domain model so the API can hand them straight over.
 */
function toFrameDoc(cells, col, seq, samplingHz) {
  const at = (name) => cells[col[name]];
  const lap = Math.trunc(num(at("Lap")));
  return {
    _id: seq,
    lap,
    sector: Math.trunc(num(at("Sector"))),
    timeS: num(at("Time_s")),
    raceTimeS: Number((seq / samplingHz).toFixed(5)),
    distanceM: num(at("Distance_m")),
    progressPct: num(at("Track_Progress_pct")),
    activeTurn: Math.trunc(num(at("Active_Turn"))),
    turnPhase: String(at("Turn_Phase") ?? "").trim(),
    speedKmh: num(at("Vehicle_Speed_kmh")),
    longAccelG: num(at("Longitudinal_Accel_g")),
    latAccelG: num(at("Lateral_Accel_g")),
    steerFrontDeg: num(at("Steer_Angle_Front_deg")),
    steerRearDeg: num(at("Steer_Angle_Rear_deg")),
    rideHeightMm: {
      FL: num(at("Ride_Height_Front_Left_mm")),
      FR: num(at("Ride_Height_Front_Right_mm")),
      RL: num(at("Ride_Height_Rear_Left_mm")),
      RR: num(at("Ride_Height_Rear_Right_mm")),
    },
    tireTempC: {
      FL: num(at("Tire_Temp_Front_Left_C")),
      FR: num(at("Tire_Temp_Front_Right_C")),
      RL: num(at("Tire_Temp_Rear_Left_C")),
      RR: num(at("Tire_Temp_Rear_Right_C")),
    },
    tirePressureBar: {
      FL: num(at("Tire_Pressure_Front_Left_bar")),
      FR: num(at("Tire_Pressure_Front_Right_bar")),
      RL: num(at("Tire_Pressure_Rear_Left_bar")),
      RR: num(at("Tire_Pressure_Rear_Right_bar")),
    },
    wheelRpm: {
      FL: num(at("Tire_Speed_Front_Left_RPM")),
      FR: num(at("Tire_Speed_Front_Right_RPM")),
      RL: num(at("Tire_Speed_Rear_Left_RPM")),
      RR: num(at("Tire_Speed_Rear_Right_RPM")),
    },
    brakeBar: {
      front: num(at("Braking_Pressure_Front_bar")),
      rear: num(at("Braking_Pressure_Rear_bar")),
    },
    wingPressureKpa: {
      front: num(at("Env_Air_Pressure_Front_Wing_kPa")),
      rear: num(at("Env_Air_Pressure_Rear_Wing_kPa")),
    },
    axleLoadN: {
      front: num(at("Axle_Load_Front_N")),
      rear: num(at("Axle_Load_Rear_N")),
    },
    humidityPct: num(at("Humidity_on_Track_pct")),
    gps: { x: num(at("GPS_X_m")), y: num(at("GPS_Y_m")) },
  };
}

async function seedTurns(db, file, drop) {
  const collection = db.collection("silverstone_turns");
  if (drop) await collection.deleteMany({});

  const lines = [];
  const reader = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of reader) if (line.trim()) lines.push(line);

  const header = splitRow(lines[0]);
  const col = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  const docs = lines.slice(1).map((line, i) => {
    const cells = splitRow(line);
    return {
      _id: i + 1,
      turn: String(cells[col.Turn]).trim(),
      number: i + 1,
      distanceM: num(cells[col.Distance_m]),
      direction: String(cells[col.Direction]).trim(),
      severity: num(cells[col.Severity]),
    };
  });

  await collection.insertMany(docs, { ordered: false });
  await collection.createIndex({ distanceM: 1 });
  return docs.length;
}

async function seedFrames(db, file, drop) {
  const collection = db.collection("silverstone_frames");
  if (drop) await collection.deleteMany({});

  const reader = createInterface({ input: createReadStream(file), crlfDelay: Infinity });

  let col = null;
  let samplingHz = 24;
  let track = "Silverstone";
  let seq = 0;
  let batch = [];
  const racingLine = [];
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  let lapFrameCount = 0;
  let firstLap = null;
  let maxDistanceM = 0;

  const flush = async () => {
    if (!batch.length) return;
    await collection.insertMany(batch, { ordered: false });
    process.stdout.write(`\r  inserted ${seq.toLocaleString()} frames`);
    batch = [];
  };

  for await (const line of reader) {
    if (!line.trim()) continue;
    if (!col) {
      const header = splitRow(line);
      col = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
      continue;
    }
    const cells = splitRow(line);
    if (seq === 0) {
      samplingHz = Math.trunc(num(cells[col.Sampling_Hz])) || 24;
      track = String(cells[col.Track]).trim();
    }

    const doc = toFrameDoc(cells, col, seq, samplingHz);
    if (firstLap === null) firstLap = doc.lap;
    if (doc.lap === firstLap) lapFrameCount++;
    if (doc.distanceM > maxDistanceM) maxDistanceM = doc.distanceM;

    bounds.minX = Math.min(bounds.minX, doc.gps.x);
    bounds.maxX = Math.max(bounds.maxX, doc.gps.x);
    bounds.minY = Math.min(bounds.minY, doc.gps.y);
    bounds.maxY = Math.max(bounds.maxY, doc.gps.y);

    batch.push(doc);
    seq++;
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  process.stdout.write("\n");

  // One decimated lap of GPS points, stored on meta so the track map can draw
  // the outline without pulling every frame down to the browser.
  //
  // The source tags the final ~3.5 s of each lap as the *next* lap's sector 1
  // with distance reset to zero, so the raw lap-1 range covers slightly more
  // than one lap. Keep only the monotonically increasing distance run, or the
  // outline doubles back over its own start and the sector colouring breaks.
  const stride = Math.max(1, Math.floor(lapFrameCount / RACING_LINE_POINTS));
  const lapCursor = collection
    .find({ lap: firstLap }, { projection: { gps: 1, distanceM: 1, sector: 1 } })
    .sort({ _id: 1 });
  let i = 0;
  let lastDistance = -Infinity;
  for await (const doc of lapCursor) {
    if (doc.distanceM < lastDistance) break;
    lastDistance = doc.distanceM;
    if (i % stride === 0) {
      // [x, y, sector, distance] — the distance lets the map place turn markers
      // at their true lap position instead of assuming evenly spaced points.
      racingLine.push([
        Number(doc.gps.x.toFixed(2)),
        Number(doc.gps.y.toFixed(2)),
        doc.sector,
        Number(doc.distanceM.toFixed(1)),
      ]);
    }
    i++;
  }

  console.log("  building indexes…");
  await collection.createIndex({ lap: 1, timeS: 1 });
  await collection.createIndex({ distanceM: 1 });
  await collection.createIndex({ activeTurn: 1 });

  return { seq, samplingHz, track, lapFrameCount, racingLine, bounds, maxDistanceM };
}

/** Per-lap rollups, computed in the database rather than in the browser. */
async function buildLapSummaries(db, drop) {
  const laps = db.collection("silverstone_laps");
  if (drop) await laps.deleteMany({});

  const pipeline = [
    {
      $group: {
        _id: "$lap",
        frames: { $sum: 1 },
        durationS: { $max: "$timeS" },
        avgSpeedKmh: { $avg: "$speedKmh" },
        maxSpeedKmh: { $max: "$speedKmh" },
        minSpeedKmh: { $min: "$speedKmh" },
        avgTireTempFL: { $avg: "$tireTempC.FL" },
        avgTireTempFR: { $avg: "$tireTempC.FR" },
        avgTireTempRL: { $avg: "$tireTempC.RL" },
        avgTireTempRR: { $avg: "$tireTempC.RR" },
        maxTireTempC: {
          $max: {
            $max: ["$tireTempC.FL", "$tireTempC.FR", "$tireTempC.RL", "$tireTempC.RR"],
          },
        },
        avgTirePressureBar: {
          $avg: {
            $avg: [
              "$tirePressureBar.FL",
              "$tirePressureBar.FR",
              "$tirePressureBar.RL",
              "$tirePressureBar.RR",
            ],
          },
        },
        peakLatAccelG: { $max: { $abs: "$latAccelG" } },
        peakLongAccelG: { $max: { $abs: "$longAccelG" } },
        peakBrakeBar: { $max: "$brakeBar.front" },
        avgHumidityPct: { $avg: "$humidityPct" },
        startSeq: { $min: "$_id" },
        endSeq: { $max: "$_id" },
      },
    },
    { $set: { lap: "$_id" } },
    { $merge: { into: "silverstone_laps", whenMatched: "replace", whenNotMatched: "insert" } },
  ];

  await db.collection("silverstone_frames").aggregate(pipeline).toArray();
  return laps.countDocuments();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = args.uri ?? process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
  const dbName = args.db ?? process.env.MONGODB_DB ?? "slipstream-x";

  const framesCsv = resolveCsv(args.frames, DEFAULTS.frames, "frames");
  const turnsCsv = resolveCsv(args.turns, DEFAULTS.turns, "turns");

  console.log(`SlipStream-X seed`);
  console.log(`  mongo   ${uri.replace(/\/\/[^@]*@/, "//<credentials>@")} · db ${dbName}`);
  console.log(`  frames  ${framesCsv}`);
  console.log(`  turns   ${turnsCsv}`);
  if (args.drop) console.log("  --drop  existing Silverstone collections will be emptied");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  try {
    const turnCount = await seedTurns(db, turnsCsv, args.drop);
    console.log(`  turns   ${turnCount} inserted`);

    const stats = await seedFrames(db, framesCsv, args.drop);
    const lapCount = Math.round(stats.seq / stats.lapFrameCount);

    const lapSummaries = await buildLapSummaries(db, args.drop);
    console.log(`  laps    ${lapSummaries} summaries built`);

    const meta = {
      _id: "silverstone",
      track: stats.track,
      circuitId: "silverstone",
      samplingHz: stats.samplingHz,
      frameCount: stats.seq,
      lapCount,
      framesPerLap: stats.lapFrameCount,
      lapDistanceM: Number(stats.maxDistanceM.toFixed(3)),
      lapDurationS: Number((stats.lapFrameCount / stats.samplingHz).toFixed(4)),
      totalDurationS: Number((stats.seq / stats.samplingHz).toFixed(4)),
      turnCount,
      gpsBounds: stats.bounds,
      racingLine: stats.racingLine,
      source: {
        frames: path.basename(framesCsv),
        turns: path.basename(turnsCsv),
      },
      seededAt: new Date(),
    };
    await db.collection("silverstone_meta").replaceOne({ _id: meta._id }, meta, { upsert: true });

    // Saved runs replace the old localStorage store; index them for listing.
    await db.collection("runs").createIndex({ startedAt: -1 });
    await db.collection("runs").createIndex({ runId: 1 }, { unique: true });

    console.log("\nSeed complete");
    console.log(
      `  ${stats.seq.toLocaleString()} frames · ${lapCount} laps · ${stats.samplingHz} Hz`,
    );
    console.log(`  lap ${meta.lapDistanceM} m / ${meta.lapDurationS} s · ${turnCount} turns`);
    console.log(`  racing line ${stats.racingLine.length} points`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
