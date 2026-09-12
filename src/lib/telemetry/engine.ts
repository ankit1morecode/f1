import {
  PROTOCOL_VERSION,
  SOFTWARE_VERSION,
  SEVERITY_RANK,
  type ConnectionState,
  type GripState,
  type GripTrend,
  type HealthState,
  type RecordedSession,
  type Sample,
  type SessionMeta,
  type Severity,
  type TelemetryEvent,
  type TelemetrySnapshot,
  type Corner,
  type PitState,
  type StrategyState,
  type TireCompound,
  type TireCondition,
  type TireSetState,
  type TrackState,
  type Zone,
} from "./types";

import { getSettings } from "./settings";
import { CIRCUITS, circuitById, type Circuit } from "./circuits";
import { COMPOUND_SPEC, DRIVERS, driverById, type Driver } from "./drivers";

function rankCompounds(circuit: Circuit, worstDeg: number, avgTemp: number, lapsRun: number): { ranking: import("./types").CompoundScore[]; } {
  const base: Record<TireCompound, number> = { SOFT: 0, MEDIUM: 0, HARD: 0 };
  // abrasive circuits and hot, worn tires push toward harder rubber
  base.HARD = circuit.abrasion * 60 + worstDeg * 0.35 + Math.max(0, avgTemp - 100) * 1.4;
  base.MEDIUM = 46 + (1 - Math.abs(circuit.abrasion - 0.6)) * 18 + Math.max(0, 60 - worstDeg) * 0.12;
  base.SOFT = (1 - circuit.abrasion) * 62 + Math.max(0, 30 - lapsRun) * 0.8 + Math.max(0, 95 - avgTemp) * 0.25;
  base[circuit.preferredCompound] += 8;
  const notes: Record<TireCompound, string> = {
    SOFT: `Fastest single-lap pace, shortest life on ${circuit.name}`,
    MEDIUM: "Balanced pace and stint length — safest race choice",
    HARD: `Longest life against ${Math.round(circuit.abrasion * 100)}% surface abrasion`,
  };
  const ranking = (["SOFT", "MEDIUM", "HARD"] as TireCompound[])
    .map((compound) => ({ compound, score: Math.round(Math.max(5, Math.min(99, base[compound]))), note: notes[compound] }))
    .sort((a, b) => b.score - a.score);
  return { ranking };
}

const RATE_HZ = 20;
const HISTORY_LIMIT = 20 * 120; // bounded live history: ~120 s
const EVENT_LIMIT = 120;
const CORNERS: Corner[] = ["FL", "FR", "RL", "RR"];

function conditionFor(degradation: number): TireCondition {
  if (degradation >= 78) return "CRITICAL";
  if (degradation >= 58) return "HIGH_DEG";
  if (degradation >= 36) return "DEGRADING";
  return "OPTIMAL";
}

function freshTires(compound: TireCompound, stint: number): TireSetState {
  const setId = `${compound[0]}-${String(stint + 3).padStart(2, "0")}`;
  const startGrip = COMPOUND_SPEC[compound].startGrip;
  const corners = Object.fromEntries(CORNERS.map((corner) => [corner, {
    corner, steering: 0, rideHeight: corner[0] === "F" ? 34 : 39,
    temperature: 72, pressure: 1.42, speed: 0, grip: startGrip, degradation: 0,
    condition: "OPTIMAL" as TireCondition,
  }])) as Record<Corner, TireSetState["corners"][Corner]>;
  return { compound, setId, stint, stintAgeLaps: 0, corners };
}

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Severity bands come from user-adjustable settings, not fixed demo numbers. */
function gripStateFor(score: number): GripState {
  const { gripHigh, gripMedium, gripLow } = getSettings();
  if (score >= gripHigh) return "HIGH";
  if (score >= gripMedium) return "MEDIUM";
  if (score >= gripLow) return "LOW";
  return "CRITICAL";
}


/**
 * Deterministic-ish behavioural model standing in for firmware telemetry.
 * Keeps protocol shape identical to the frozen contract so the transport layer
 * can be swapped without touching the UI.
 */
class TelemetryEngine {
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private phase = 0;
  private grip = 84;
  private conf = 92;
  private strategyConf = 82;
  private strategyConfAt = 0;
  private lastTrend: GripTrend = "STABLE";
  private startedAt = Date.now();
  private packets = 0;
  private lost = 0;
  private sessionNumber = 1;

  running = false;
  latest: Sample | null = null;
  history: Sample[] = [];
  events: TelemetryEvent[] = [];
  health: HealthState = {
    imu: "OK",
    can: "OK",
    logging: "OK",
    watchdog: "OK",
    boardTemp: 41.2,
    supplyVoltage: 13.8,
  };
  connection: ConnectionState = {
    status: "DISCONNECTED",
    packetRate: 0,
    latencyMs: 0,
    lossPct: 0,
    malformed: 0,
    versionMismatch: false,
  };
  session: SessionMeta = this.newSessionMeta();
  tires: TireSetState = freshTires("MEDIUM", 1);
  pit: PitState = { status: "IDLE", requestedAt: null, countdownMs: 0, nextCompound: "HARD", history: [] };
  circuit: Circuit = CIRCUITS[0]!;
  driver: Driver = DRIVERS[0]!;
  /** phase at which the current tire set went on — keeps wear per stint. */
  private stintStartPhase = 0;
  private stintStartLap = 1;
  track: TrackState = { circuitId: CIRCUITS[0]!.id, name: CIRCUITS[0]!.name, lap: 1, sector: 1, progress: 0, distanceKm: 0, lapKm: CIRCUITS[0]!.lapKm };
  strategy: StrategyState = { pitWindow: "CLOSED", recommendedLap: 18, recommendedCompound: "HARD", reason: "Tire condition is stable", expectedBenefit: "Protect current track position", confidence: 82, finalCompound: CIRCUITS[0]!.preferredCompound, finalReason: CIRCUITS[0]!.note, ranking: rankCompounds(CIRCUITS[0]!, 0, 80, 0).ranking };

  setDriver(driverId: string) {
    const driver = driverById(driverId);
    if (driver.id === this.driver.id) return;
    this.driver = driver;
    this.pushEvent("INFO", "TRACK", "DRIVER_CHANGE", `${driver.name} is in the car`, `Car #${driver.carNumber} · ${driver.carName} · ${driver.style}`);
    this.emit();
  }


  setCircuit(circuitId: string) {
    const circuit = circuitById(circuitId);
    if (circuit.id === this.circuit.id) return;
    this.circuit = circuit;
    this.track = { circuitId: circuit.id, name: circuit.name, lap: 1, sector: 1, progress: 0, distanceKm: 0, lapKm: circuit.lapKm };
    this.pushEvent("INFO", "TRACK", "CIRCUIT_CHANGE", `Circuit set to ${circuit.name}`, `${circuit.country} · ${circuit.lapKm.toFixed(3)} km · ${circuit.corners} corners`);
    this.emit();
  }

  private newSessionMeta(): SessionMeta {
    return {
      id: `RUN-${String(this.sessionNumber).padStart(3, "0")}`,
      profile: "TRACK / DRY-BASELINE",
      startedAt: Date.now(),
      endedAt: null,
      protocolVersion: PROTOCOL_VERSION,
      softwareVersion: SOFTWARE_VERSION,
      durationMs: 0,
      packets: 0,
      lossPct: 0,
    };
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  snapshot(): TelemetrySnapshot {
    return {
      running: this.running,
      latest: this.latest,
      history: this.history,
      events: this.events,
      health: this.health,
      connection: this.connection,
      session: this.session,
      tires: this.tires,
      pit: this.pit,
      track: this.track,
      strategy: this.strategy,
      driver: this.driver,
    };
  }

  start() {
    if (this.timer) return;
    if (!this.latest) this.startedAt = Date.now();
    this.running = true;
    this.connection = { ...this.connection, status: "CONNECTED" };
    this.pushEvent("INFO", "TRANSPORT", "LINK_UP", "Telemetry link established", `Protocol v${PROTOCOL_VERSION} accepted`);
    this.timer = setInterval(() => this.tick(), 1000 / RATE_HZ);
    this.emit();
  }

  pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    this.connection = { ...this.connection, status: "DISCONNECTED", packetRate: 0 };
    this.emit();
  }

  reset() {
    this.pause();
    this.seq = 0;
    this.phase = 0;
    this.grip = 84;
    this.conf = 92;
    this.strategyConf = 82;
    this.packets = 0;
    this.lost = 0;
    this.latest = null;
    this.history = [];
    this.events = [];
    this.sessionNumber += 1;
    this.session = this.newSessionMeta();
    this.tires = freshTires("MEDIUM", 1);
    this.pit = { status: "IDLE", requestedAt: null, countdownMs: 0, nextCompound: "HARD", history: [] };
    this.track = { circuitId: this.circuit.id, name: this.circuit.name, lap: 1, sector: 1, progress: 0, distanceKm: 0, lapKm: this.circuit.lapKm };
    this.stintStartPhase = 0;
    this.stintStartLap = 1;
    this.startedAt = Date.now();
    this.emit();
  }

  requestPit(nextCompound: TireCompound = this.pit.nextCompound) {
    if (this.pit.status !== "IDLE") return;
    this.pit = { ...this.pit, status: "REQUESTED", requestedAt: Date.now(), countdownMs: 10000, nextCompound };
    this.pushEvent("WARNING", "PIT", "PIT_REQUESTED", "Pit requested", `${nextCompound} set prepared · 10 second service window`);
    this.emit();
  }

  setNextCompound(compound: TireCompound) {
    if (this.pit.status !== "IDLE") return;
    this.pit = { ...this.pit, nextCompound: compound };
    this.emit();
  }

  private completePit() {
    const old = this.tires;
    const next = freshTires(this.pit.nextCompound, old.stint + 1);
    const completedAt = this.latest?.t ?? 0;
    this.pit = { status: "IDLE", requestedAt: null, countdownMs: 0, nextCompound: old.compound, history: [...this.pit.history, {
      id: id("PIT"), requestedAt: Math.max(0, completedAt - 10000), completedAt, lap: this.track.lap,
      oldSetId: old.setId, newSetId: next.setId, oldCompound: old.compound, newCompound: next.compound,
    }] };
    this.tires = next;
    // tire-local state restarts: wear clock and stint lap counter reset here
    this.stintStartPhase = this.phase;
    this.stintStartLap = this.track.lap;
    this.pushEvent("INFO", "PIT", "PIT_COMPLETE", "Pit complete", `${next.compound} ${next.setId} active · fresh at ${COMPOUND_SPEC[next.compound].startGrip}% grip · session history preserved`);
  }

  private pushEvent(
    severity: Severity,
    category: TelemetryEvent["category"],
    code: string,
    title: string,
    detail: string,
  ) {
    const t = this.latest?.t ?? 0;
    const last = this.events[0];
    if (last && last.code === code && t - last.t < 3000) return;
    this.events = [
      { id: id("EV"), t, wallClock: Date.now(), severity, category, code, title, detail },
      ...this.events,
    ].slice(0, EVENT_LIMIT);
  }

  private tick() {
    this.seq += 1;
    this.packets += 1;
    this.phase += 1 / RATE_HZ;
    const p = this.phase;

    // simulated packet loss / malformed frames
    const dropped = Math.random() < 0.004;
    if (dropped) {
      this.lost += 1;
      this.connection = {
        ...this.connection,
        status: "DEGRADED",
        lossPct: (this.lost / this.packets) * 100,
      };
      this.pushEvent(
        "ADVISORY",
        "TRANSPORT",
        "PKT_LOSS",
        "Communication degradation",
        `Sequence gap at packet #${this.seq} — inference confidence reduced`,
      );
      this.conf = Math.max(38, this.conf - 6);
      this.emit();
      return;
    }

    const circuit = this.circuit;
    // circuit character drives how busy the traces are
    const busy = 0.55 + circuit.corners / 26; // more corners -> livelier steering/yaw
    const corner = Math.sin(p * 0.42 * busy) * 0.82 + Math.sin(p * 1.15 * busy) * 0.18;
    const braking = Math.max(0, -Math.cos(p * 0.31)) ** 2;
    const surface = (Math.sin(p * 1.7) * 0.5 + Math.sin(p * 4.3) * 0.25) * (0.5 + circuit.abrasion);

    // high-variation channels: lateral load, yaw, slip, vibration, braking
    const ay = corner * 1.55 + surface * 0.12 + (Math.random() - 0.5) * 0.06;
    const ax = braking * -1.35 + Math.max(0, Math.cos(p * 0.31)) * 0.7;
    const yawRate = corner * 26 + surface * 2.4 + Math.sin(p * 3.3) * 1.8;
    const wheelSlip = Math.max(0, Math.abs(ay) * 4.1 + braking * 6.2 + surface * 2.1);
    const vibrationRms = 1.2 + Math.abs(surface) * 4.4 + Math.abs(ay) * 1.3 + Math.random() * 0.4;
    const yawOscillation = 0.5 + Math.abs(Math.sin(p * 2.1)) * 2.9;

    // low-variation channels: vertical load, ride quality, gentle speed envelope
    const az = 1 + surface * 0.04 + (Math.random() - 0.5) * 0.015;
    const speed = (78 + Math.cos(p * 0.31) * 42) * (0.72 + circuit.speedFactor * 0.42);
    const loadTransition = Math.abs(ax) * 0.35 + Math.abs(ay) * 0.28;

    // inferred grip drifts against instability load
    const load = Math.abs(ay) * 18 + wheelSlip * 1.6 + vibrationRms * 2.2 + yawOscillation * 3;
    const target = Math.max(12, Math.min(97, 108 - load));
    const prev = this.grip;
    this.grip += (target - this.grip) * 0.06;
    const delta = this.grip - prev;

    let trend: GripTrend = "STABLE";
    if (delta < -0.28) trend = "DEGRADING";
    else if (delta > 0.28) trend = this.grip < 60 ? "RECOVERING" : "IMPROVING";

    this.conf = Math.max(
      35,
      Math.min(98, this.conf + (94 - this.conf) * 0.05 - Math.abs(surface) * 1.6),
    );

    const zone: Zone =
      Math.abs(ax) > 0.7
        ? ax < 0
          ? "FRONT_AXLE"
          : "REAR_AXLE"
        : Math.abs(ay) > 0.55
          ? ay > 0
            ? "RIGHT"
            : "LEFT"
          : "BALANCED";

    const state = gripStateFor(this.grip);
    const app1 = Math.max(0, Math.cos(p * 0.31)) * 100;
    const app2 = Math.max(0, app1 + Math.sin(p * 0.9) * 0.25);
    const lapDistanceKm = circuit.lapKm;
    const distanceDeltaKm = speed / 3600 / RATE_HZ;
    const nextDistance = this.track.distanceKm + distanceDeltaKm;
    const nextLap = Math.floor(nextDistance / lapDistanceKm) + 1;
    const progress = (nextDistance % lapDistanceKm) / lapDistanceKm;
    const sector: 1 | 2 | 3 = progress < circuit.sectors[0] ? 1 : progress < circuit.sectors[1] ? 2 : 3;
    if (nextLap !== this.track.lap) this.pushEvent("INFO", "TRACK", "LAP_COMPLETE", `Lap ${this.track.lap} complete`, `New lap started on ${this.track.name}`);
    this.track = { ...this.track, distanceKm: nextDistance, lap: nextLap, progress, sector };

    const spec = COMPOUND_SPEC[this.tires.compound];
    const stintLaps = Math.max(0, nextLap - this.stintStartLap);
    // wear clock is tire-local: it restarts from zero at every pit stop
    const stintSeconds = Math.max(0, p - this.stintStartPhase);
    const wearRate = (0.55 + circuit.abrasion) * spec.wearRate * this.driver.wearFactor;
    const baseDeg = Math.min(97, (stintLaps * 3.4 + stintSeconds * 0.32) * wearRate);
    const makeCorner = (cornerKey: Corner, bias: number) => {
      const degradation = Math.max(0, Math.min(100, baseDeg + bias * spec.wearRate + Math.abs(corner) * (cornerKey[1] === "R" ? 3 : 1)));
      return { corner: cornerKey, steering: cornerKey[0] === "F" ? corner * 42 : corner * 2.5,
        rideHeight: (cornerKey[0] === "F" ? 34 : 39) + surface * 0.9,
        temperature: 78 + Math.abs(ay) * 14 + braking * 9 + degradation * 0.12 + bias,
        pressure: 1.42 + Math.abs(ay) * 0.03 + degradation * 0.0012,
        speed: speed + bias * 0.3,
        grip: Math.max(6, spec.startGrip - degradation * 0.78 - wheelSlip * 0.35),
        degradation, condition: conditionFor(degradation) };
    };
    const corners = { FL: makeCorner("FL", 2), FR: makeCorner("FR", 5), RL: makeCorner("RL", 0), RR: makeCorner("RR", 7) };
    this.tires = { ...this.tires, stintAgeLaps: stintLaps, corners };
    if (this.pit.status === "REQUESTED" && this.pit.requestedAt) {
      const countdownMs = Math.max(0, 10000 - (Date.now() - this.pit.requestedAt));
      this.pit = { ...this.pit, countdownMs };
      if (countdownMs === 0) this.completePit();
    }
    const worstDeg = Math.max(...CORNERS.map((c) => this.tires.corners[c].degradation));
    const avgTemp = CORNERS.reduce((sum, c) => sum + this.tires.corners[c].temperature, 0) / 4;
    const pitWindow = worstDeg >= 58 ? "OPEN" : worstDeg >= 42 ? "APPROACHING" : "CLOSED";
    const { ranking } = rankCompounds(circuit, worstDeg, avgTemp, this.tires.stintAgeLaps);
    const best = ranking[0]!;
    // Strategy confidence updates at most once per second so the displayed
    // number steps calmly instead of flickering with pedal jitter.
    const rawConf = Math.max(62, Math.min(94, this.conf - Math.abs(app1 - app2) * 3));
    const nowMs = Date.now();
    if (nowMs - this.strategyConfAt >= 1000) {
      this.strategyConfAt = nowMs;
      this.strategyConf += (rawConf - this.strategyConf) * 0.5;
    }
    this.strategy = { pitWindow, recommendedLap: this.track.lap + (pitWindow === "OPEN" ? 1 : pitWindow === "APPROACHING" ? 3 : 7),
      recommendedCompound: best.compound,
      reason: worstDeg >= 58 ? "Rear tire degradation is accelerating" : worstDeg >= 42 ? "Grip trend is approaching the service threshold" : "Tire condition remains inside the operating window",
      expectedBenefit: worstDeg >= 58 ? "Restore rear stability and protect lap time" : "Extend the current stint without avoidable pit loss",
      confidence: Math.round(this.strategyConf),
      finalCompound: best.compound,
      finalReason: `${best.note} · worst corner at ${worstDeg.toFixed(0)}% wear, tires averaging ${avgTemp.toFixed(0)} °C`,
      ranking };
    const sample: Sample = {
      seq: this.seq,
      t: Date.now() - this.startedAt,
      ax,
      ay,
      az,
      yawRate,
      sensorTemp: 38 + Math.abs(surface) * 2,
      speed,
      wheelSlip,
      steer: corner * 42,
      throttle: Math.max(0, Math.cos(p * 0.31)) * 100,
      brake: braking * 100,
      steeringFL: corners.FL.steering, steeringFR: corners.FR.steering, steeringRL: corners.RL.steering, steeringRR: corners.RR.steering,
      rideHeightFL: corners.FL.rideHeight, rideHeightFR: corners.FR.rideHeight, rideHeightRL: corners.RL.rideHeight, rideHeightRR: corners.RR.rideHeight,
      tireTempFL: corners.FL.temperature, tireTempFR: corners.FR.temperature, tireTempRL: corners.RL.temperature, tireTempRR: corners.RR.temperature,
      app1, app2, brakeFront: braking * 100, brakeRear: braking * 72,
      tirePressureFL: corners.FL.pressure, tirePressureFR: corners.FR.pressure, tirePressureRL: corners.RL.pressure, tirePressureRR: corners.RR.pressure,
      pitotFront: 101.3 + speed * 0.006, pitotHind: 101.3 + speed * 0.0045,
      axleLoadFront: 7.2 - ax * 1.5, axleLoadRear: 7.5 + ax * 1.5,
      speedFL: corners.FL.speed, speedFR: corners.FR.speed, speedRL: corners.RL.speed, speedRR: corners.RR.speed,
      vibrationRms,
      yawOscillation,
      loadTransition,
      gripScore: this.grip,
      gripState: state,
      confidence: this.conf,
      trend,
      zone,
      reserve: Math.max(0, this.grip - 20),
      stale: false,
    };

    this.latest = sample;
    this.history = [...this.history, sample].slice(-HISTORY_LIMIT);

    // health drift
    this.health = {
      ...this.health,
      boardTemp: 40 + Math.abs(surface) * 6 + Math.abs(ay),
      supplyVoltage: 13.9 - braking * 0.5,
      can: this.connection.lossPct > 1.2 ? "DEGRADED" : "OK",
    };
    this.connection = {
      ...this.connection,
      status: this.connection.lossPct > 2 ? "DEGRADED" : "CONNECTED",
      packetRate: RATE_HZ,
      latencyMs: 6 + Math.random() * 5,
      lossPct: (this.lost / this.packets) * 100,
    };
    this.session = {
      ...this.session,
      durationMs: sample.t,
      packets: this.packets,
      lossPct: this.connection.lossPct,
    };

    // event engine — bands taken from user settings
    const cfg = getSettings();
    if (trend === "DEGRADING" && this.grip < cfg.degradingGrip)
      this.pushEvent("WARNING", "GRIP", "GRIP_DEGRADING", "Grip degrading", `Score ${this.grip.toFixed(1)} · dominant zone ${zone}`);
    if (yawOscillation > cfg.yawOscWarn && Math.abs(ay) > cfg.latAccelWarn)
      this.pushEvent("CRITICAL", "STABILITY", "INSTABILITY", "Instability detected", `Yaw oscillation ${yawOscillation.toFixed(2)} Hz at ${Math.abs(ay).toFixed(2)} g lateral`);
    if (vibrationRms > cfg.vibrationInfo)
      this.pushEvent("INFO", "SURFACE", "SURFACE_DISTURB", "Surface disturbance", `Vibration RMS ${vibrationRms.toFixed(2)} m/s² — context only, not classified as instability`);
    if (trend === "RECOVERING")
      this.pushEvent("ADVISORY", "GRIP", "GRIP_RECOVER", "Grip recovering", "Transition toward stable behavioural region");
    if (this.conf < cfg.confidenceWarn)
      this.pushEvent("WARNING", "SENSOR", "SENSOR_DISAGREE", "Sensor disagreement", `Inference confidence ${this.conf.toFixed(0)}% — source: IMU vs wheel-speed`);
    if (Math.abs(app1 - app2) > 2) this.pushEvent("CRITICAL", "SENSOR", "APP_DISAGREE", "Accelerator sensors disagree", `APP delta ${Math.abs(app1 - app2).toFixed(1)}%`);
    if (pitWindow === "OPEN") this.pushEvent("WARNING", "STRATEGY", "PIT_WINDOW", "Pit window open", `${this.strategy.recommendedCompound} recommended on lap ${this.strategy.recommendedLap}`);


    this.lastTrend = trend;
    this.emit();
  }

  get activeEvent(): TelemetryEvent | null {
    const first = this.events[0];
    if (!first) return null;
    const recent = this.events.filter((e) => (this.latest?.t ?? 0) - e.t < 8000);
    const pool: TelemetryEvent[] = recent.length ? recent : [first];
    return pool.reduce<TelemetryEvent>(
      (a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a),
      first,
    );
  }


  /** Persist the current run so Replay/Analysis can load it without hardware. */
  saveSession(): RecordedSession | null {
    if (!this.history.length) return null;
    const meta: SessionMeta = { ...this.session, endedAt: Date.now() };
    const step = Math.max(1, Math.ceil(this.history.length / 2400));
    const rec: RecordedSession = {
      meta,
      samples: this.history.filter((_, i) => i % step === 0),
      events: this.events,
      pitHistory: this.pit.history,
    };
    const all = listSessions().filter((s) => s.meta.id !== meta.id);
    writeSessions([rec, ...all].slice(0, 8));
    this.session = meta;
    this.emit();
    return rec;
  }
}

const STORE_KEY = "slipstreamx.sessions.v1";

export function listSessions(): RecordedSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "[]") as RecordedSession[];
  } catch {
    return [];
  }
}

function writeSessions(sessions: RecordedSession[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
}

export function deleteSession(sessionId: string) {
  writeSessions(listSessions().filter((s) => s.meta.id !== sessionId));
}

export function sessionToCsv(session: RecordedSession): string {
  const keys = Object.keys(session.samples[0] ?? {});
  const rows = session.samples.map((s) =>
    keys.map((k) => String((s as unknown as Record<string, unknown>)[k])).join(","),
  );
  return [`# session=${session.meta.id} protocol=${session.meta.protocolVersion} software=${session.meta.softwareVersion}`, keys.join(","), ...rows].join("\n");
}

export const engine = new TelemetryEngine();
