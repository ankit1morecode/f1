export const PROTOCOL_VERSION = "2.1.0";
export const SOFTWARE_VERSION = "slipstream-x-display 2.0.0";

export type GripState = "HIGH" | "MEDIUM" | "LOW" | "CRITICAL";
export type GripTrend = "IMPROVING" | "STABLE" | "DEGRADING" | "RECOVERING";
export type Zone = "FRONT_AXLE" | "REAR_AXLE" | "LEFT" | "RIGHT" | "BALANCED";
export type Severity = "INFO" | "ADVISORY" | "WARNING" | "CRITICAL";
export type Corner = "FL" | "FR" | "RL" | "RR";
export type TireCompound = "SOFT" | "MEDIUM" | "HARD";
export type TireCondition = "OPTIMAL" | "DEGRADING" | "HIGH_DEG" | "CRITICAL";

export interface TireCornerState {
  corner: Corner;
  steering: number;
  rideHeight: number;
  temperature: number;
  pressure: number;
  speed: number;
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

/** One decoded, validated telemetry sample (source-timestamped by firmware). */
export interface Sample {
  seq: number;
  /** ms since session start, from the firmware clock */
  t: number;
  // measured — inertial
  ax: number;
  ay: number;
  az: number;
  yawRate: number;
  sensorTemp: number;
  // measured — vehicle
  speed: number;
  wheelSlip: number;
  steer: number;
  throttle: number;
  brake: number;
  // 32 dossier physical channels — four corners / paired sensors
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
  app1: number;
  app2: number;
  brakeFront: number;
  brakeRear: number;
  tirePressureFL: number;
  tirePressureFR: number;
  tirePressureRL: number;
  tirePressureRR: number;
  pitotFront: number;
  pitotHind: number;
  axleLoadFront: number;
  axleLoadRear: number;
  speedFL: number;
  speedFR: number;
  speedRL: number;
  speedRR: number;
  // derived features
  vibrationRms: number;
  yawOscillation: number;
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
  category: "GRIP" | "STABILITY" | "SURFACE" | "SENSOR" | "TRANSPORT" | "TIRE" | "PIT" | "TRACK" | "STRATEGY";
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
}

export interface RecordedSession {
  meta: SessionMeta;
  samples: Sample[];
  events: TelemetryEvent[];
  pitHistory?: PitStop[];
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
  { key: "ax", label: "Long. accel", unit: "g", kind: "measured" },
  { key: "ay", label: "Lat. accel", unit: "g", kind: "measured" },
  { key: "az", label: "Vert. accel", unit: "g", kind: "measured" },
  { key: "yawRate", label: "Yaw rate", unit: "°/s", kind: "measured" },
  { key: "speed", label: "Vehicle speed", unit: "km/h", kind: "measured" },
  { key: "wheelSlip", label: "Wheel slip", unit: "%", kind: "measured" },
  { key: "vibrationRms", label: "Vibration RMS", unit: "m/s²", kind: "derived" },
  { key: "yawOscillation", label: "Yaw oscillation", unit: "Hz", kind: "derived" },
  { key: "loadTransition", label: "Load transition", unit: "idx", kind: "derived" },
  { key: "app1", label: "APP 1", unit: "%", kind: "measured", group: "Accelerator" },
  { key: "app2", label: "APP 2", unit: "%", kind: "measured", group: "Accelerator" },
  { key: "brakeFront", label: "Front brake", unit: "%", kind: "measured", group: "Braking" },
  { key: "brakeRear", label: "Rear brake", unit: "%", kind: "measured", group: "Braking" },
  { key: "pitotFront", label: "Front Pitot", unit: "kPa", kind: "measured", group: "Air pressure" },
  { key: "pitotHind", label: "Hind Pitot", unit: "kPa", kind: "measured", group: "Air pressure" },
  { key: "axleLoadFront", label: "Front axle load", unit: "kN", kind: "measured", group: "Axle load" },
  { key: "axleLoadRear", label: "Rear axle load", unit: "kN", kind: "measured", group: "Axle load" },
  { key: "tireTempFL", label: "FL temp", unit: "°C", kind: "measured", group: "Tire temperature" },
  { key: "tireTempFR", label: "FR temp", unit: "°C", kind: "measured", group: "Tire temperature" },
  { key: "tireTempRL", label: "RL temp", unit: "°C", kind: "measured", group: "Tire temperature" },
  { key: "tireTempRR", label: "RR temp", unit: "°C", kind: "measured", group: "Tire temperature" },
  { key: "tirePressureFL", label: "FL pressure", unit: "bar", kind: "measured", group: "Tire pressure" },
  { key: "tirePressureFR", label: "FR pressure", unit: "bar", kind: "measured", group: "Tire pressure" },
  { key: "tirePressureRL", label: "RL pressure", unit: "bar", kind: "measured", group: "Tire pressure" },
  { key: "tirePressureRR", label: "RR pressure", unit: "bar", kind: "measured", group: "Tire pressure" },
  { key: "rideHeightFL", label: "FL ride height", unit: "mm", kind: "measured", group: "Ride height" },
  { key: "rideHeightFR", label: "FR ride height", unit: "mm", kind: "measured", group: "Ride height" },
  { key: "rideHeightRL", label: "RL ride height", unit: "mm", kind: "measured", group: "Ride height" },
  { key: "rideHeightRR", label: "RR ride height", unit: "mm", kind: "measured", group: "Ride height" },
  { key: "steeringFL", label: "FL steering", unit: "°", kind: "measured", group: "Steering" },
  { key: "steeringFR", label: "FR steering", unit: "°", kind: "measured", group: "Steering" },
  { key: "steeringRL", label: "RL steering", unit: "°", kind: "measured", group: "Steering" },
  { key: "steeringRR", label: "RR steering", unit: "°", kind: "measured", group: "Steering" },
  { key: "speedFL", label: "FL speed", unit: "km/h", kind: "measured", group: "Speed" },
  { key: "speedFR", label: "FR speed", unit: "km/h", kind: "measured", group: "Speed" },
  { key: "speedRL", label: "RL speed", unit: "km/h", kind: "measured", group: "Speed" },
  { key: "speedRR", label: "RR speed", unit: "km/h", kind: "measured", group: "Speed" },
] as const;

export type ChannelKey = (typeof CHANNELS)[number]["key"];
