export const PROTOCOL_VERSION = "3.0.0";
export const SOFTWARE_VERSION = "slipstream-x-display 3.0.0";

export type GripState = "HIGH" | "MEDIUM" | "LOW" | "CRITICAL";
export type GripTrend = "IMPROVING" | "STABLE" | "DEGRADING" | "RECOVERING";
export type Zone = "FRONT_AXLE" | "REAR_AXLE" | "LEFT" | "RIGHT" | "BALANCED";
export type Severity = "INFO" | "ADVISORY" | "WARNING" | "CRITICAL";
export type Corner = "FL" | "FR" | "RL" | "RR";
export type TireCompound = "SOFT" | "MEDIUM" | "HARD";
export type TireCondition = "OPTIMAL" | "DEGRADING" | "HIGH_DEG" | "CRITICAL";

/**
 * Where a session's numbers come from.
 * - `measured`  — frames replayed from the supplied Silverstone dataset in MongoDB
 * - `simulated` — the behavioural model, used for circuits with no supplied data
 */
export type TelemetrySource = "measured" | "simulated";

export interface TireCornerState {
  corner: Corner;
  steering: number;
  rideHeight: number;
  temperature: number;
  pressure: number;
  /** Wheel rotational speed (RPM) — measured per corner. */
  wheelRpm: number;
  grip: number;
  degradation: number;
  condition: TireCondition;
}

export interface TireSetState {
  compound: TireCompound;
  setId: string;
  stint: number;
  stintAgeLaps: number;
  corners: Record<Corner, TireCornerState>;
}

export interface PitStop {
  id: string;
  requestedAt: number;
  completedAt: number;
  lap: number;
  oldSetId: string;
  newSetId: string;
  oldCompound: TireCompound;
  newCompound: TireCompound;
}

export interface PitState {
  status: "IDLE" | "REQUESTED";
  /** Session-relative ms, matching `Sample.t`. */
  requestedAt: number | null;
  countdownMs: number;
  nextCompound: TireCompound;
  history: PitStop[];
}

export interface TrackState {
  circuitId: string;
  name: string;
  lap: number;
  sector: 1 | 2 | 3;
  progress: number;
  distanceKm: number;
  lapKm: number;
  /** 1-18 on the supplied circuit, 0 between turns. */
  activeTurn: number;
  turnPhase: string;
  /** Track position in circuit metres, when the source provides GPS. */
  gpsX: number;
  gpsY: number;
}

export interface CompoundScore {
  compound: TireCompound;
  score: number;
  note: string;
}

export interface StrategyState {
  pitWindow: "CLOSED" | "APPROACHING" | "OPEN";
  recommendedLap: number;
  recommendedCompound: TireCompound;
  reason: string;
  expectedBenefit: string;
  confidence: number;
  /** Final tire choice for the next stint, with the ranked alternatives. */
  finalCompound: TireCompound;
  finalReason: string;
  ranking: CompoundScore[];
}

/**
 * One telemetry sample.
 *
 * On the supplied circuit every `measured` field below is read straight from the
 * dataset; `derived` fields are computed from those measurements, and `inferred`
 * fields come from the grip model. Channels the dataset does not carry
 * (accelerator-pedal position, vertical acceleration, yaw rate) are absent by
 * design rather than fabricated.
 */
export interface Sample {
  seq: number;
  /** ms since session start. */
  t: number;
  /** Where this sample came from. */
  source: TelemetrySource;

  // measured — vehicle
  speed: number;
  ax: number;
  ay: number;
  steer: number;
  steerRear: number;

  // measured — 32 dossier channels, four corners / paired sensors
  steeringFL: number;
  steeringFR: number;
  steeringRL: number;
  steeringRR: number;
  rideHeightFL: number;
  rideHeightFR: number;
  rideHeightRL: number;
  rideHeightRR: number;
  tireTempFL: number;
  tireTempFR: number;
  tireTempRL: number;
  tireTempRR: number;
  tirePressureFL: number;
  tirePressureFR: number;
  tirePressureRL: number;
  tirePressureRR: number;
  wheelRpmFL: number;
  wheelRpmFR: number;
  wheelRpmRL: number;
  wheelRpmRR: number;
  brakeFront: number;
  brakeRear: number;
  wingPressureFront: number;
  wingPressureRear: number;
  axleLoadFront: number;
  axleLoadRear: number;
  humidity: number;

  // measured — position
  gpsX: number;
  gpsY: number;

  // derived features
  /** Rolling RMS of acceleration change — surface and kerb energy. */
  vibrationRms: number;
  /** Front steering angular rate (°/s) — stands in for yaw activity. */
  steerRate: number;
  /** Wheel-speed disagreement against vehicle speed (%). */
  wheelSlip: number;
  loadTransition: number;

  // inferred
  gripScore: number;
  gripState: GripState;
  confidence: number;
  trend: GripTrend;
  zone: Zone;
  reserve: number;
  /** true when the packet failed validation or arrived late */
  stale: boolean;
}

export interface TelemetryEvent {
  id: string;
  t: number;
  wallClock: number;
  severity: Severity;
  code: string;
  title: string;
  detail: string;
  category:
    | "GRIP"
    | "STABILITY"
    | "SURFACE"
    | "SENSOR"
    | "TRANSPORT"
    | "TIRE"
    | "PIT"
    | "TRACK"
    | "STRATEGY";
}

export interface HealthState {
  imu: "OK" | "DEGRADED" | "FAULT";
  can: "OK" | "DEGRADED" | "FAULT";
  logging: "OK" | "DEGRADED" | "FAULT";
  watchdog: "OK" | "DEGRADED" | "FAULT";
  boardTemp: number;
  supplyVoltage: number;
}

export interface ConnectionState {
  status: "CONNECTED" | "DEGRADED" | "DISCONNECTED";
  packetRate: number;
  latencyMs: number;
  lossPct: number;
  malformed: number;
  versionMismatch: boolean;
  /** Data-source label shown in the header. */
  source: TelemetrySource;
}

export interface SessionMeta {
  id: string;
  profile: string;
  startedAt: number;
  endedAt: number | null;
  protocolVersion: string;
  softwareVersion: string;
  durationMs: number;
  packets: number;
  lossPct: number;
  source: TelemetrySource;
  /** Frame range of the supplied dataset this run covers, when measured. */
  sourceRange: { startSeq: number; endSeq: number } | null;
}

export interface RecordedSession {
  meta: SessionMeta;
  samples: Sample[];
  events: TelemetryEvent[];
  pitHistory: PitStop[];
}

export interface TelemetrySnapshot {
  running: boolean;
  latest: Sample | null;
  history: Sample[];
  events: TelemetryEvent[];
  health: HealthState;
  connection: ConnectionState;
  session: SessionMeta;
  tires: TireSetState;
  pit: PitState;
  track: TrackState;
  strategy: StrategyState;
  driver: import("./drivers").Driver;
  /** Replay speed-up applied to reach true race pace; 1 = untouched. */
  paceScale: number;
  /** Dataset loading state, for the measured source. */
  dataStatus: "idle" | "loading" | "ready" | "error";
  dataError: string | null;
}

export const SEVERITY_RANK: Record<Severity, number> = {
  INFO: 0,
  ADVISORY: 1,
  WARNING: 2,
  CRITICAL: 3,
};

export const CHANNELS = [
  { key: "gripScore", label: "Grip score", unit: "", kind: "inferred" },
  { key: "reserve", label: "Reserve", unit: "%", kind: "inferred" },
  { key: "confidence", label: "Confidence", unit: "%", kind: "inferred" },
  { key: "speed", label: "Vehicle speed", unit: "km/h", kind: "measured" },
  { key: "ax", label: "Long. accel", unit: "g", kind: "measured" },
  { key: "ay", label: "Lat. accel", unit: "g", kind: "measured" },
  { key: "vibrationRms", label: "Vibration RMS", unit: "m/s²", kind: "derived" },
  { key: "steerRate", label: "Steering rate", unit: "°/s", kind: "derived" },
  { key: "wheelSlip", label: "Wheel slip", unit: "%", kind: "derived" },
  { key: "loadTransition", label: "Load transition", unit: "idx", kind: "derived" },
  { key: "steer", label: "Front steering", unit: "°", kind: "measured", group: "Steering" },
  { key: "steerRear", label: "Rear steering", unit: "°", kind: "measured", group: "Steering" },
  { key: "brakeFront", label: "Front brake", unit: "bar", kind: "measured", group: "Braking" },
  { key: "brakeRear", label: "Rear brake", unit: "bar", kind: "measured", group: "Braking" },
  {
    key: "wingPressureFront",
    label: "Front wing pressure",
    unit: "kPa",
    kind: "measured",
    group: "Air pressure",
  },
  {
    key: "wingPressureRear",
    label: "Rear wing pressure",
    unit: "kPa",
    kind: "measured",
    group: "Air pressure",
  },
  { key: "humidity", label: "Track humidity", unit: "%", kind: "measured", group: "Environment" },
  {
    key: "axleLoadFront",
    label: "Front axle load",
    unit: "N",
    kind: "measured",
    group: "Axle load",
  },
  { key: "axleLoadRear", label: "Rear axle load", unit: "N", kind: "measured", group: "Axle load" },
  { key: "tireTempFL", label: "FL temp", unit: "°C", kind: "measured", group: "Tire temperature" },
  { key: "tireTempFR", label: "FR temp", unit: "°C", kind: "measured", group: "Tire temperature" },
  { key: "tireTempRL", label: "RL temp", unit: "°C", kind: "measured", group: "Tire temperature" },
  { key: "tireTempRR", label: "RR temp", unit: "°C", kind: "measured", group: "Tire temperature" },
  {
    key: "tirePressureFL",
    label: "FL pressure",
    unit: "bar",
    kind: "measured",
    group: "Tire pressure",
  },
  {
    key: "tirePressureFR",
    label: "FR pressure",
    unit: "bar",
    kind: "measured",
    group: "Tire pressure",
  },
  {
    key: "tirePressureRL",
    label: "RL pressure",
    unit: "bar",
    kind: "measured",
    group: "Tire pressure",
  },
  {
    key: "tirePressureRR",
    label: "RR pressure",
    unit: "bar",
    kind: "measured",
    group: "Tire pressure",
  },
  {
    key: "rideHeightFL",
    label: "FL ride height",
    unit: "mm",
    kind: "measured",
    group: "Ride height",
  },
  {
    key: "rideHeightFR",
    label: "FR ride height",
    unit: "mm",
    kind: "measured",
    group: "Ride height",
  },
  {
    key: "rideHeightRL",
    label: "RL ride height",
    unit: "mm",
    kind: "measured",
    group: "Ride height",
  },
  {
    key: "rideHeightRR",
    label: "RR ride height",
    unit: "mm",
    kind: "measured",
    group: "Ride height",
  },
  {
    key: "steeringFL",
    label: "FL steering",
    unit: "°",
    kind: "measured",
    group: "Corner steering",
  },
  {
    key: "steeringFR",
    label: "FR steering",
    unit: "°",
    kind: "measured",
    group: "Corner steering",
  },
  {
    key: "steeringRL",
    label: "RL steering",
    unit: "°",
    kind: "measured",
    group: "Corner steering",
  },
  {
    key: "steeringRR",
    label: "RR steering",
    unit: "°",
    kind: "measured",
    group: "Corner steering",
  },
  {
    key: "wheelRpmFL",
    label: "FL wheel speed",
    unit: "RPM",
    kind: "measured",
    group: "Wheel speed",
  },
  {
    key: "wheelRpmFR",
    label: "FR wheel speed",
    unit: "RPM",
    kind: "measured",
    group: "Wheel speed",
  },
  {
    key: "wheelRpmRL",
    label: "RL wheel speed",
    unit: "RPM",
    kind: "measured",
    group: "Wheel speed",
  },
  {
    key: "wheelRpmRR",
    label: "RR wheel speed",
    unit: "RPM",
    kind: "measured",
    group: "Wheel speed",
  },
] as const;

export type ChannelKey = (typeof CHANNELS)[number]["key"];
