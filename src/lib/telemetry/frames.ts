import type { FrameDoc } from "@/lib/db/schema";

/**
 * Wire format for telemetry frames.
 *
 * Frames travel as plain number arrays in `FRAME_COLUMNS` order rather than as
 * objects: at 24 Hz a 60-second chunk is 1 440 frames, and repeating ~40 key
 * names per frame would roughly triple the payload for no benefit. Both sides
 * import this module, so the column order can only ever change in one place.
 */

export const FRAME_COLUMNS = [
  "seq",
  "lap",
  "sector",
  "timeS",
  "raceTimeS",
  "distanceM",
  "progressPct",
  "activeTurn",
  "turnPhase",
  "speedKmh",
  "longAccelG",
  "latAccelG",
  "steerFrontDeg",
  "steerRearDeg",
  "rideHeightFL",
  "rideHeightFR",
  "rideHeightRL",
  "rideHeightRR",
  "tireTempFL",
  "tireTempFR",
  "tireTempRL",
  "tireTempRR",
  "tirePressureFL",
  "tirePressureFR",
  "tirePressureRL",
  "tirePressureRR",
  "wheelRpmFL",
  "wheelRpmFR",
  "wheelRpmRL",
  "wheelRpmRR",
  "brakeFrontBar",
  "brakeRearBar",
  "wingPressureFront",
  "wingPressureRear",
  "axleLoadFront",
  "axleLoadRear",
  "humidityPct",
  "gpsX",
  "gpsY",
] as const;

export type FrameColumn = (typeof FRAME_COLUMNS)[number];

/** `turnPhase` rides the wire as an index into this table. */
export const TURN_PHASES = ["STRAIGHT", "APPROACH", "BRAKING", "TURN-IN", "APEX"] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];

export type FrameRow = number[];

/** A decoded frame: every field is a measurement from the supplied dataset. */
export type LiveFrame = { [K in Exclude<FrameColumn, "turnPhase">]: number } & {
  turnPhase: TurnPhase;
};

function phaseIndex(phase: string): number {
  const i = TURN_PHASES.indexOf(phase as TurnPhase);
  return i === -1 ? 0 : i;
}

/** Trims float noise; the source CSV carries at most 5 decimal places. */
function round(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

export function encodeFrame(doc: FrameDoc): FrameRow {
  return [
    doc._id,
    doc.lap,
    doc.sector,
    doc.timeS,
    doc.raceTimeS,
    doc.distanceM,
    doc.progressPct,
    doc.activeTurn,
    phaseIndex(doc.turnPhase),
    doc.speedKmh,
    doc.longAccelG,
    doc.latAccelG,
    doc.steerFrontDeg,
    doc.steerRearDeg,
    doc.rideHeightMm.FL,
    doc.rideHeightMm.FR,
    doc.rideHeightMm.RL,
    doc.rideHeightMm.RR,
    doc.tireTempC.FL,
    doc.tireTempC.FR,
    doc.tireTempC.RL,
    doc.tireTempC.RR,
    doc.tirePressureBar.FL,
    doc.tirePressureBar.FR,
    doc.tirePressureBar.RL,
    doc.tirePressureBar.RR,
    doc.wheelRpm.FL,
    doc.wheelRpm.FR,
    doc.wheelRpm.RL,
    doc.wheelRpm.RR,
    doc.brakeBar.front,
    doc.brakeBar.rear,
    doc.wingPressureKpa.front,
    doc.wingPressureKpa.rear,
    doc.axleLoadN.front,
    doc.axleLoadN.rear,
    doc.humidityPct,
    doc.gps.x,
    doc.gps.y,
  ].map(round);
}

const COLUMN_INDEX = Object.fromEntries(FRAME_COLUMNS.map((name, i) => [name, i])) as Record<
  FrameColumn,
  number
>;

export function decodeFrame(row: FrameRow): LiveFrame {
  const at = (name: FrameColumn) => row[COLUMN_INDEX[name]] ?? 0;
  return {
    seq: at("seq"),
    lap: at("lap"),
    sector: at("sector"),
    timeS: at("timeS"),
    raceTimeS: at("raceTimeS"),
    distanceM: at("distanceM"),
    progressPct: at("progressPct"),
    activeTurn: at("activeTurn"),
    turnPhase: TURN_PHASES[at("turnPhase")] ?? "STRAIGHT",
    speedKmh: at("speedKmh"),
    longAccelG: at("longAccelG"),
    latAccelG: at("latAccelG"),
    steerFrontDeg: at("steerFrontDeg"),
    steerRearDeg: at("steerRearDeg"),
    rideHeightFL: at("rideHeightFL"),
    rideHeightFR: at("rideHeightFR"),
    rideHeightRL: at("rideHeightRL"),
    rideHeightRR: at("rideHeightRR"),
    tireTempFL: at("tireTempFL"),
    tireTempFR: at("tireTempFR"),
    tireTempRL: at("tireTempRL"),
    tireTempRR: at("tireTempRR"),
    tirePressureFL: at("tirePressureFL"),
    tirePressureFR: at("tirePressureFR"),
    tirePressureRL: at("tirePressureRL"),
    tirePressureRR: at("tirePressureRR"),
    wheelRpmFL: at("wheelRpmFL"),
    wheelRpmFR: at("wheelRpmFR"),
    wheelRpmRL: at("wheelRpmRL"),
    wheelRpmRR: at("wheelRpmRR"),
    brakeFrontBar: at("brakeFrontBar"),
    brakeRearBar: at("brakeRearBar"),
    wingPressureFront: at("wingPressureFront"),
    wingPressureRear: at("wingPressureRear"),
    axleLoadFront: at("axleLoadFront"),
    axleLoadRear: at("axleLoadRear"),
    humidityPct: at("humidityPct"),
    gpsX: at("gpsX"),
    gpsY: at("gpsY"),
  };
}

/* ---------- API payload shapes ---------- */

export interface TurnInfo {
  number: number;
  turn: string;
  distanceM: number;
  direction: string;
  severity: number;
}

export interface LapInfo {
  lap: number;
  frames: number;
  durationS: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  minSpeedKmh: number;
  maxTireTempC: number;
  avgTirePressureBar: number;
  peakLatAccelG: number;
  peakLongAccelG: number;
  peakBrakeBar: number;
  avgHumidityPct: number;
  startSeq: number;
  endSeq: number;
}

export interface TelemetryMetaPayload {
  track: string;
  circuitId: string;
  samplingHz: number;
  frameCount: number;
  lapCount: number;
  framesPerLap: number;
  lapDistanceM: number;
  lapDurationS: number;
  totalDurationS: number;
  gpsBounds: { minX: number; maxX: number; minY: number; maxY: number };
  racingLine: [number, number, number, number][];
  turns: TurnInfo[];
  laps: LapInfo[];
  source: { frames: string; turns: string };
  /** Changes on every reseed; used to bust cached frame chunks. */
  version: string;
  /** Scripted instability episodes written over the recording, if any. */
  instabilityEpisodes: number;
}

export interface FrameChunkPayload {
  columns: readonly string[];
  phases: readonly string[];
  from: number;
  count: number;
  frameCount: number;
  frames: FrameRow[];
}
