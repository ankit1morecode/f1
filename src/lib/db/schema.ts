/**
 * Shapes of the documents written by `scripts/seed-mongo.mjs`.
 *
 * These describe what is *stored*. The wire format the API hands to the browser
 * is the compact tuple encoding in `src/lib/telemetry/frames.ts` — one row of
 * numbers per frame instead of ~40 repeated key names, which keeps a 60-second
 * chunk in the low hundreds of kilobytes.
 */

export type CornerKey = "FL" | "FR" | "RL" | "RR";
export type CornerValues = Record<CornerKey, number>;
export type AxleValues = { front: number; rear: number };

/** One 24 Hz sample. `_id` doubles as the global frame sequence number. */
export interface FrameDoc {
  _id: number;
  lap: number;
  sector: number;
  /** Seconds since the start of this lap. */
  timeS: number;
  /** Seconds since the start of the stint, continuous across laps. */
  raceTimeS: number;
  distanceM: number;
  progressPct: number;
  /** 1-18, or 0 on the straights. */
  activeTurn: number;
  turnPhase: string;
  speedKmh: number;
  longAccelG: number;
  latAccelG: number;
  steerFrontDeg: number;
  steerRearDeg: number;
  rideHeightMm: CornerValues;
  tireTempC: CornerValues;
  tirePressureBar: CornerValues;
  wheelRpm: CornerValues;
  brakeBar: AxleValues;
  wingPressureKpa: AxleValues;
  axleLoadN: AxleValues;
  humidityPct: number;
  gps: { x: number; y: number };
}

export interface TurnDoc {
  _id: number;
  turn: string;
  number: number;
  distanceM: number;
  direction: string;
  severity: number;
}

export interface LapSummaryDoc {
  _id: number;
  lap: number;
  frames: number;
  durationS: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  minSpeedKmh: number;
  avgTireTempFL: number;
  avgTireTempFR: number;
  avgTireTempRL: number;
  avgTireTempRR: number;
  maxTireTempC: number;
  avgTirePressureBar: number;
  peakLatAccelG: number;
  peakLongAccelG: number;
  peakBrakeBar: number;
  avgHumidityPct: number;
  startSeq: number;
  endSeq: number;
}

export interface TrackMetaDoc {
  _id: string;
  track: string;
  circuitId: string;
  samplingHz: number;
  frameCount: number;
  lapCount: number;
  framesPerLap: number;
  lapDistanceM: number;
  lapDurationS: number;
  totalDurationS: number;
  turnCount: number;
  gpsBounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Decimated single-lap outline: [x, y, sector, distanceM] tuples. */
  racingLine: [number, number, number, number][];
  source: { frames: string; turns: string };
  seededAt: Date;
}

/** An editable, presentation-only driver profile. */
export interface DriverProfileDoc {
  _id: string;
  name: string;
  photoUrl: string;
  description: string;
  /** ImageKit fileId, when the photo was uploaded rather than linked. */
  photoFileId: string | null;
  updatedAt: Date;
}

/** A saved run. Replaces the old localStorage session store. */
export interface RunDoc {
  _id?: unknown;
  runId: string;
  label: string;
  circuitId: string;
  driverId: string;
  driverName: string;
  compound: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number;
  /** Frame range of the source data this run covers, when data-driven. */
  sourceRange: { startSeq: number; endSeq: number } | null;
  protocolVersion: string;
  softwareVersion: string;
  sampleCount: number;
  /** Downsampled samples, stored as tuples in `sampleColumns` order. */
  sampleColumns: string[];
  samples: number[][];
  events: {
    t: number;
    severity: string;
    category: string;
    code: string;
    title: string;
    detail: string;
  }[];
  pitHistory: Record<string, unknown>[];
}
