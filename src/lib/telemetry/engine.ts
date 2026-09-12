import {
  PROTOCOL_VERSION,
  SOFTWARE_VERSION,
  SEVERITY_RANK,
  type ConnectionState,
  type Corner,
  type GripState,
  type GripTrend,
  type HealthState,
  type PitState,
  type RecordedSession,
  type Sample,
  type SessionMeta,
  type Severity,
  type StrategyState,
  type TelemetryEvent,
  type TelemetrySnapshot,
  type TelemetrySource,
  type TireCompound,
  type TireCondition,
  type TireSetState,
  type TrackState,
  type Zone,
} from "./types";

import { getSettings } from "./settings";
import { CIRCUITS, circuitById, type Circuit } from "./circuits";
import { COMPOUND_SPEC, DRIVERS, driverById, type Driver } from "./drivers";
import { frameSource } from "./frameSource";
import type { LiveFrame } from "./frames";

/** Circuit whose telemetry comes from the supplied dataset in MongoDB. */
const MEASURED_CIRCUIT_ID = "silverstone";

/**
 * Reference F1 lap time for the supplied circuit, in seconds.
 *
 * The supplied dataset covers Silverstone's 5.891 km in 218 s at ~100 km/h
 * average and 134 km/h peak — a correctly shaped lap recorded on a 2.5x slow
 * time base. Lap time, average speed and top speed each imply the same factor
 * independently (2.51 / 2.42 / 2.46), which is what a uniform time-base error
 * looks like rather than a physically different car.
 *
 * `paceScale` divides the dataset's own lap duration by this target, so the
 * correction is derived from the data instead of hard-coded, and collapses to
 * exactly 1 (a no-op) the moment the source is reseeded at true race pace.
 */
const TARGET_LAP_SECONDS = 87;
/** Tick rate for the behavioural model used on circuits without supplied data. */
const SIMULATED_HZ = 20;
/** Live history window, in seconds. */
const HISTORY_SECONDS = 120;
const EVENT_LIMIT = 120;
const CORNERS: Corner[] = ["FL", "FR", "RL", "RR"];

/** Samples kept when a run is written to MongoDB. */
const SAVED_SAMPLE_LIMIT = 3000;

function rankCompounds(
  circuit: Circuit,
  worstDeg: number,
  avgTemp: number,
  lapsRun: number,
): import("./types").CompoundScore[] {
  const base: Record<TireCompound, number> = { SOFT: 0, MEDIUM: 0, HARD: 0 };
  // abrasive circuits and hot, worn tires push toward harder rubber
  base.HARD = circuit.abrasion * 60 + worstDeg * 0.35 + Math.max(0, avgTemp - 78) * 1.4;
  base.MEDIUM =
    46 + (1 - Math.abs(circuit.abrasion - 0.6)) * 18 + Math.max(0, 60 - worstDeg) * 0.12;
  base.SOFT =
    (1 - circuit.abrasion) * 62 +
    Math.max(0, 30 - lapsRun) * 0.8 +
    Math.max(0, 74 - avgTemp) * 0.25;
  base[circuit.preferredCompound] += 8;
  const notes: Record<TireCompound, string> = {
    SOFT: `Fastest single-lap pace, shortest life on ${circuit.name}`,
    MEDIUM: "Balanced pace and stint length — safest race choice",
    HARD: `Longest life against ${Math.round(circuit.abrasion * 100)}% surface abrasion`,
  };
  return (["SOFT", "MEDIUM", "HARD"] as TireCompound[])
    .map((compound) => ({
      compound,
      score: Math.round(Math.max(5, Math.min(99, base[compound]))),
      note: notes[compound],
    }))
    .sort((a, b) => b.score - a.score);
}

/** Hardest acceleration an F1 car actually produces, in g (braking peak). */
const ACCEL_LIMIT_G = 6;

function clampG(value: number): number {
  return Math.max(-ACCEL_LIMIT_G, Math.min(ACCEL_LIMIT_G, value));
}

function conditionFor(degradation: number): TireCondition {
  if (degradation >= 78) return "CRITICAL";
  if (degradation >= 58) return "HIGH_DEG";
  if (degradation >= 36) return "DEGRADING";
  return "OPTIMAL";
}

function freshTires(compound: TireCompound, stint: number): TireSetState {
  const setId = `${compound[0]}-${String(stint + 3).padStart(2, "0")}`;
  const startGrip = COMPOUND_SPEC[compound].startGrip;
  const corners = Object.fromEntries(
    CORNERS.map((corner) => [
      corner,
      {
        corner,
        steering: 0,
        rideHeight: corner[0] === "F" ? 34 : 39,
        temperature: 68,
        pressure: 1.15,
        wheelRpm: 0,
        grip: startGrip,
        degradation: 0,
        condition: "OPTIMAL" as TireCondition,
      },
    ]),
  ) as Record<Corner, TireSetState["corners"][Corner]>;
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
 * RMS deviation of a signal from its own recent mean.
 *
 * Vibration means surface and kerb roughness, so the slow component — a steady
 * 2 g cornering load — has to be removed first. Measuring raw sample-to-sample
 * change instead counts every legitimate braking and cornering transition as
 * vibration, which drove the channel past 45 m/s².
 */
class RollingJitter {
  private values: number[] = [];
  constructor(private readonly size: number) {}
  push(value: number): number {
    this.values.push(value);
    if (this.values.length > this.size) this.values.shift();
    const n = this.values.length;
    const mean = this.values.reduce((a, b) => a + b, 0) / n;
    const variance = this.values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    return Math.sqrt(variance);
  }
  reset() {
    this.values = [];
  }
}

/**
 * Drives one race session.
 *
 * On Silverstone the samples are frames of the supplied 24 Hz dataset, streamed
 * from MongoDB by `frameSource`; every other circuit falls back to the
 * behavioural model. Both paths produce the same `Sample` shape, so the screens
 * never need to know which is running — `sample.source` says which it was.
 *
 * The session clock is driven by the tick counter rather than `Date.now()`, so
 * pausing does not tear a hole in the time axis or fast-forward a pit stop.
 */
class TelemetryEngine {
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Ticks since the run started — the single source of session time. */
  private ticks = 0;
  private rateHz = SIMULATED_HZ;

  /** Behavioural-model state (simulated circuits only). */
  private phase = 0;
  private stintStartPhase = 0;

  /** Frame cursor into the supplied dataset (measured circuits only). */
  private playSeq = 0;
  /** Fractional frame cursor — the integer part is `playSeq`. */
  private playHead = 0;
  private startSeq = 0;
  private lastFrame: LiveFrame | null = null;
  private prevFrame: LiveFrame | null = null;
  /** Per-corner temperature/pressure at the start of the current stint. */
  private stintBaseline: { temp: Record<Corner, number>; pressure: Record<Corner, number> } | null =
    null;
  /** Self-calibrating rolling circumference (m), for the wheel-slip derivation. */
  private rollingCircumference = 1.732;
  private circumferenceSamples = 0;
  private vibration = new RollingJitter(16);

  private grip = 84;
  private conf = 92;
  private strategyConf = 82;
  private strategyConfAt = 0;
  /** Rolled fresh on every pit request: 5-10 s service window. */
  private pitDurationMs = 7500;
  private lastShareAt = 0;
  private packets = 0;
  private lost = 0;
  private sessionNumber = 1;
  private stintStartLap = 1;
  private historyLimit = SIMULATED_HZ * HISTORY_SECONDS;

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
    source: "measured",
  };
  // `circuit` and `driver` are declared before `session` on purpose: class
  // fields initialise in source order, and newSessionMeta() reads the circuit
  // to decide whether this run is measured or simulated.
  circuit: Circuit = circuitById(MEASURED_CIRCUIT_ID);
  driver: Driver = DRIVERS[0]!;
  session: SessionMeta = this.newSessionMeta();
  tires: TireSetState = freshTires("MEDIUM", 1);
  pit: PitState = {
    status: "IDLE",
    requestedAt: null,
    countdownMs: 0,
    nextCompound: "HARD",
    history: [],
  };
  track: TrackState = {
    circuitId: MEASURED_CIRCUIT_ID,
    name: circuitById(MEASURED_CIRCUIT_ID).name,
    lap: 1,
    sector: 1,
    progress: 0,
    distanceKm: 0,
    lapKm: circuitById(MEASURED_CIRCUIT_ID).lapKm,
    activeTurn: 0,
    turnPhase: "STRAIGHT",
    gpsX: 0,
    gpsY: 0,
  };
  strategy: StrategyState = {
    pitWindow: "CLOSED",
    recommendedLap: 18,
    recommendedCompound: "HARD",
    reason: "Tire condition is stable",
    expectedBenefit: "Protect current track position",
    confidence: 82,
    finalCompound: circuitById(MEASURED_CIRCUIT_ID).preferredCompound,
    finalReason: circuitById(MEASURED_CIRCUIT_ID).note,
    ranking: rankCompounds(circuitById(MEASURED_CIRCUIT_ID), 0, 68, 0),
  };

  /** True when this circuit's telemetry comes from the supplied dataset. */
  get isMeasured(): boolean {
    return this.circuit.id === MEASURED_CIRCUIT_ID;
  }

  /**
   * How much faster than the recording the lap is replayed, so the car runs at
   * F1 pace. 1 means the dataset is already at race pace and nothing is altered.
   */
  get paceScale(): number {
    const lapSeconds = frameSource.meta?.lapDurationS ?? 0;
    if (!lapSeconds) return 1;
    return Math.max(1, lapSeconds / TARGET_LAP_SECONDS);
  }

  /**
   * Puts one frame on the corrected time base.
   *
   * Covering the same geometry k times faster multiplies speed and wheel
   * rotation by k, and both accelerations by k² (lateral is v²/r at unchanged
   * radius; longitudinal is dv/dt). Distance, GPS, sector, temperature, pressure
   * and load are geometry or physical state and are left exactly as recorded.
   */
  private atRacePace(frame: LiveFrame, k: number): LiveFrame {
    if (k === 1) return frame;
    const k2 = k * k;
    return {
      ...frame,
      speedKmh: frame.speedKmh * k,
      // The source speed trace has occasional single-sample discontinuities.
      // They are harmless at the recorded pace but k² turns them into 10 g
      // spikes, so the corrected values are held inside a physical envelope.
      longAccelG: clampG(frame.longAccelG * k2),
      latAccelG: clampG(frame.latAccelG * k2),
      wheelRpmFL: frame.wheelRpmFL * k,
      wheelRpmFR: frame.wheelRpmFR * k,
      wheelRpmRL: frame.wheelRpmRL * k,
      wheelRpmRR: frame.wheelRpmRR * k,
    };
  }

  get sourceKind(): TelemetrySource {
    return this.isMeasured ? "measured" : "simulated";
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
      source: this.sourceKind,
      sourceRange: null,
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
      // A fresh array each snapshot so memoised chart consumers see the change;
      // the buffer itself is mutated in place rather than rebuilt every tick.
      history: this.history.slice(),
      events: this.events,
      health: this.health,
      connection: this.connection,
      session: this.session,
      tires: this.tires,
      pit: this.pit,
      track: this.track,
      strategy: this.strategy,
      driver: this.driver,
      paceScale: this.isMeasured ? this.paceScale : 1,
      dataStatus: frameSource.status,
      dataError: frameSource.error,
    };
  }

  setDriver(driverId: string) {
    const driver = driverById(driverId);
    if (driver.id === this.driver.id) return;
    this.driver = driver;
    this.pushEvent(
      "INFO",
      "TRACK",
      "DRIVER_CHANGE",
      `${driver.name} is in the car`,
      `Car #${driver.carNumber} · ${driver.carName} · ${driver.style}`,
    );
    this.emit();
  }

  setCircuit(circuitId: string) {
    const circuit = circuitById(circuitId);
    if (circuit.id === this.circuit.id) return;
    const wasRunning = this.running;
    if (wasRunning) this.pause();

    this.circuit = circuit;
    this.track = {
      circuitId: circuit.id,
      name: circuit.name,
      lap: 1,
      sector: 1,
      progress: 0,
      distanceKm: 0,
      lapKm: circuit.lapKm,
      activeTurn: 0,
      turnPhase: "STRAIGHT",
      gpsX: 0,
      gpsY: 0,
    };
    // The lap counter restarts, so the stint clock has to rebase with it —
    // otherwise stint age goes negative and the wear model silently resets.
    this.stintStartLap = 1;
    this.stintStartPhase = this.phase;
    this.stintBaseline = null;
    this.playSeq = 0;
    this.playHead = 0;
    this.startSeq = 0;
    this.lastFrame = null;
    this.prevFrame = null;
    this.vibration.reset();
    this.session = { ...this.session, source: this.sourceKind };
    this.connection = { ...this.connection, source: this.sourceKind };

    this.pushEvent(
      "INFO",
      "TRACK",
      "CIRCUIT_CHANGE",
      `Circuit set to ${circuit.name}`,
      `${circuit.country} · ${circuit.lapKm.toFixed(3)} km · ${circuit.corners} corners · ` +
        (this.isMeasured ? "supplied 24 Hz dataset" : "behavioural model"),
    );

    if (wasRunning) this.start();
    else this.emit();
  }

  start() {
    if (this.timer) return;
    this.running = true;
    this.rateHz = this.isMeasured ? frameSource.samplingHz : SIMULATED_HZ;
    this.historyLimit = this.rateHz * HISTORY_SECONDS;

    if (this.isMeasured) {
      void frameSource.load().then(() => {
        // Adopt the dataset's real rate once metadata has landed.
        if (this.running && this.isMeasured && frameSource.samplingHz !== this.rateHz) {
          this.restartTimer(frameSource.samplingHz);
        }
        this.emit();
      });
    }

    this.connection = { ...this.connection, status: "CONNECTED", source: this.sourceKind };
    this.pushEvent(
      "INFO",
      "TRANSPORT",
      "LINK_UP",
      this.isMeasured ? "Replaying supplied dataset" : "Telemetry link established",
      this.isMeasured
        ? `Silverstone 24 Hz frames from MongoDB · protocol v${PROTOCOL_VERSION}`
        : `Behavioural model · protocol v${PROTOCOL_VERSION}`,
    );
    this.restartTimer(this.rateHz);
    this.emit();
  }

  private restartTimer(rateHz: number) {
    if (this.timer) clearInterval(this.timer);
    this.rateHz = rateHz;
    this.historyLimit = rateHz * HISTORY_SECONDS;
    this.timer = setInterval(() => this.tick(), 1000 / rateHz);
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
    this.ticks = 0;
    this.phase = 0;
    this.playSeq = 0;
    this.playHead = 0;
    this.startSeq = 0;
    this.lastFrame = null;
    this.prevFrame = null;
    this.stintBaseline = null;
    this.vibration.reset();
    this.grip = 84;
    this.conf = 92;
    this.strategyConf = 82;
    this.strategyConfAt = 0;
    this.lastShareAt = 0;
    this.packets = 0;
    this.lost = 0;
    this.latest = null;
    this.history = [];
    this.events = [];
    this.sessionNumber += 1;
    this.session = this.newSessionMeta();
    this.tires = freshTires("MEDIUM", 1);
    this.pit = {
      status: "IDLE",
      requestedAt: null,
      countdownMs: 0,
      nextCompound: "HARD",
      history: [],
    };
    this.track = {
      circuitId: this.circuit.id,
      name: this.circuit.name,
      lap: 1,
      sector: 1,
      progress: 0,
      distanceKm: 0,
      lapKm: this.circuit.lapKm,
      activeTurn: 0,
      turnPhase: "STRAIGHT",
      gpsX: 0,
      gpsY: 0,
    };
    this.stintStartPhase = 0;
    this.stintStartLap = 1;
    this.emit();
  }

  /** Jump the dataset cursor to a given lap (measured circuits only). */
  seekToLap(lap: number) {
    if (!this.isMeasured || !frameSource.meta) return;
    const info = frameSource.meta.laps.find((l) => l.lap === lap);
    if (!info) return;
    this.playSeq = info.startSeq;
    this.playHead = info.startSeq;
    this.stintBaseline = null;
    this.prevFrame = null;
    frameSource.prefetchAround(info.startSeq);
    this.emit();
  }

  /** Session-relative milliseconds — monotonic and unaffected by pausing. */
  private get sessionMs(): number {
    return (this.ticks / this.rateHz) * 1000;
  }

  requestPit(nextCompound: TireCompound = this.pit.nextCompound) {
    if (this.pit.status !== "IDLE") return;
    this.pitDurationMs = (5 + Math.random() * 5) * 1000;
    this.pit = {
      ...this.pit,
      status: "REQUESTED",
      requestedAt: this.sessionMs,
      countdownMs: this.pitDurationMs,
      nextCompound,
    };
    this.pushEvent(
      "WARNING",
      "PIT",
      "PIT_REQUESTED",
      "Pit requested",
      `${nextCompound} set prepared · ${(this.pitDurationMs / 1000).toFixed(1)} second service window`,
    );
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
    const completedAt = this.sessionMs;
    this.pit = {
      status: "IDLE",
      requestedAt: null,
      countdownMs: 0,
      nextCompound: old.compound,
      history: [
        ...this.pit.history,
        {
          id: id("PIT"),
          requestedAt: Math.max(0, completedAt - this.pitDurationMs),
          completedAt,
          lap: this.track.lap,
          oldSetId: old.setId,
          newSetId: next.setId,
          oldCompound: old.compound,
          newCompound: next.compound,
        },
      ],
    };
    this.tires = next;
    // Tire-local state restarts here: the wear clock, the stint lap counter and
    // — on measured data — the temperature/pressure baseline wear is read against.
    this.stintStartPhase = this.phase;
    this.stintStartLap = this.track.lap;
    this.stintBaseline = null;
    this.pushEvent(
      "INFO",
      "PIT",
      "PIT_COMPLETE",
      "Pit complete",
      `${next.compound} ${next.setId} active · fresh at ${COMPOUND_SPEC[next.compound].startGrip}% grip · session history preserved`,
    );
  }

  private pushEvent(
    severity: Severity,
    category: TelemetryEvent["category"],
    code: string,
    title: string,
    detail: string,
  ) {
    const t = this.latest?.t ?? this.sessionMs;
    const last = this.events[0];
    if (last && last.code === code && t - last.t < 3000) return;
    this.events = [
      { id: id("EV"), t, wallClock: Date.now(), severity, category, code, title, detail },
      ...this.events,
    ].slice(0, EVENT_LIMIT);
  }

  private tick() {
    const sample = this.isMeasured ? this.measuredTick() : this.simulatedTick();
    if (!sample) return;

    this.ticks += 1;
    this.packets += 1;
    this.latest = sample;
    this.history.push(sample);
    if (this.history.length > this.historyLimit) this.history.shift();

    this.updateStrategy();
    this.updateDiagnostics(sample);
    this.raiseEvents(sample);

    const shareMs = Math.max(0, getSettings().shareFrequencyMs);
    const now = Date.now();
    if (now - this.lastShareAt >= shareMs) {
      this.lastShareAt = now;
      this.emit();
    }
  }

  /* ---------- measured path: frames from the supplied dataset ---------- */

  private measuredTick(): Sample | null {
    const k = this.paceScale;
    const raw = frameSource.frameAt(this.playSeq);
    if (!raw) {
      // Chunk still in flight — hold position rather than emitting a fake sample.
      this.connection = { ...this.connection, status: "DEGRADED" };
      return null;
    }
    const frame = this.atRacePace(raw, k);

    // Advance k frames per tick so the lap takes its real-world time. The
    // accumulator keeps the fractional part, otherwise the cursor would drift.
    this.playHead += k;
    this.playSeq = Math.floor(this.playHead);
    if (frameSource.frameCount > 0 && this.playSeq >= frameSource.frameCount) {
      this.playHead = 0;
      this.playSeq = 0;
      this.pushEvent(
        "INFO",
        "TRACK",
        "DATASET_WRAP",
        "Dataset restarted",
        `All ${frameSource.meta?.lapCount ?? 0} supplied laps replayed — looping to lap 1`,
      );
    }

    const previous = this.prevFrame ?? frame;
    this.prevFrame = frame;
    this.lastFrame = frame;
    const dt = 1 / this.rateHz;

    // --- derived from measurements ---
    // Roughness: how much the acceleration magnitude jitters around its own
    // short-term mean, in m/s².
    const accelMagnitude = Math.hypot(frame.longAccelG, frame.latAccelG) * 9.80665;
    const vibrationRms = this.vibration.push(accelMagnitude);
    const steerRate = Math.abs(frame.steerFrontDeg - previous.steerFrontDeg) / dt;
    const loadTransition = Math.abs(frame.longAccelG) * 0.35 + Math.abs(frame.latAccelG) * 0.28;
    const wheelSlip = this.deriveWheelSlip(frame);

    // --- tire state, rebased at every pit stop ---
    if (!this.stintBaseline) {
      this.stintBaseline = {
        temp: {
          FL: frame.tireTempFL,
          FR: frame.tireTempFR,
          RL: frame.tireTempRL,
          RR: frame.tireTempRR,
        },
        pressure: {
          FL: frame.tirePressureFL,
          FR: frame.tirePressureFR,
          RL: frame.tirePressureRL,
          RR: frame.tirePressureRR,
        },
      };
    }

    if (frame.lap !== this.track.lap) {
      this.pushEvent(
        "INFO",
        "TRACK",
        "LAP_COMPLETE",
        `Lap ${this.track.lap} complete`,
        `Lap ${frame.lap} of ${frameSource.meta?.lapCount ?? "?"} on ${this.track.name}`,
      );
    }

    this.track = {
      circuitId: this.circuit.id,
      name: this.circuit.name,
      lap: frame.lap,
      sector: (frame.sector === 2 ? 2 : frame.sector === 3 ? 3 : 1) as 1 | 2 | 3,
      progress: frame.progressPct / 100,
      distanceKm: frame.distanceM / 1000,
      lapKm: (frameSource.meta?.lapDistanceM ?? this.circuit.lapKm * 1000) / 1000,
      activeTurn: frame.activeTurn,
      turnPhase: frame.turnPhase,
      gpsX: frame.gpsX,
      gpsY: frame.gpsY,
    };

    const stintLaps = Math.max(0, frame.lap - this.stintStartLap);
    const spec = COMPOUND_SPEC[this.tires.compound];
    const baseline = this.stintBaseline;
    const temps: Record<Corner, number> = {
      FL: frame.tireTempFL,
      FR: frame.tireTempFR,
      RL: frame.tireTempRL,
      RR: frame.tireTempRR,
    };
    const pressures: Record<Corner, number> = {
      FL: frame.tirePressureFL,
      FR: frame.tirePressureFR,
      RL: frame.tirePressureRL,
      RR: frame.tirePressureRR,
    };
    const rideHeights: Record<Corner, number> = {
      FL: frame.rideHeightFL,
      FR: frame.rideHeightFR,
      RL: frame.rideHeightRL,
      RR: frame.rideHeightRR,
    };
    const rpms: Record<Corner, number> = {
      FL: frame.wheelRpmFL,
      FR: frame.wheelRpmFR,
      RL: frame.wheelRpmRL,
      RR: frame.wheelRpmRR,
    };

    const corners = Object.fromEntries(
      CORNERS.map((corner) => {
        // Wear is read off the measured thermal and pressure rise since this
        // tire set went on, scaled by how hard the compound works.
        const tempRise = Math.max(0, temps[corner] - baseline.temp[corner]);
        const pressureRise = Math.max(0, pressures[corner] - baseline.pressure[corner]);
        const degradation = Math.max(
          0,
          Math.min(
            100,
            (tempRise * 6 + pressureRise * 250 + stintLaps * 0.8) * (spec.wearRate / 1.1),
          ),
        );
        return [
          corner,
          {
            corner,
            steering: corner[0] === "F" ? frame.steerFrontDeg : frame.steerRearDeg,
            rideHeight: rideHeights[corner],
            temperature: temps[corner],
            pressure: pressures[corner],
            wheelRpm: rpms[corner],
            grip: Math.max(6, spec.startGrip - degradation * 0.78 - wheelSlip * 0.35),
            degradation,
            condition: conditionFor(degradation),
          },
        ];
      }),
    ) as TireSetState["corners"];

    this.tires = { ...this.tires, stintAgeLaps: stintLaps, corners };
    this.advancePit();

    const worstDeg = Math.max(...CORNERS.map((c) => corners[c].degradation));
    const grip = this.updateGrip(frame, wheelSlip, vibrationRms, worstDeg);
    const trend = this.trendFor(grip.delta);
    const zone = this.zoneFor(frame.longAccelG, frame.latAccelG);

    return {
      seq: this.ticks + 1,
      t: this.sessionMs,
      source: "measured",
      speed: frame.speedKmh,
      ax: frame.longAccelG,
      ay: frame.latAccelG,
      steer: frame.steerFrontDeg,
      steerRear: frame.steerRearDeg,
      steeringFL: frame.steerFrontDeg,
      steeringFR: frame.steerFrontDeg,
      steeringRL: frame.steerRearDeg,
      steeringRR: frame.steerRearDeg,
      rideHeightFL: frame.rideHeightFL,
      rideHeightFR: frame.rideHeightFR,
      rideHeightRL: frame.rideHeightRL,
      rideHeightRR: frame.rideHeightRR,
      tireTempFL: frame.tireTempFL,
      tireTempFR: frame.tireTempFR,
      tireTempRL: frame.tireTempRL,
      tireTempRR: frame.tireTempRR,
      tirePressureFL: frame.tirePressureFL,
      tirePressureFR: frame.tirePressureFR,
      tirePressureRL: frame.tirePressureRL,
      tirePressureRR: frame.tirePressureRR,
      wheelRpmFL: frame.wheelRpmFL,
      wheelRpmFR: frame.wheelRpmFR,
      wheelRpmRL: frame.wheelRpmRL,
      wheelRpmRR: frame.wheelRpmRR,
      brakeFront: frame.brakeFrontBar,
      brakeRear: frame.brakeRearBar,
      wingPressureFront: frame.wingPressureFront,
      wingPressureRear: frame.wingPressureRear,
      axleLoadFront: frame.axleLoadFront,
      axleLoadRear: frame.axleLoadRear,
      humidity: frame.humidityPct,
      gpsX: frame.gpsX,
      gpsY: frame.gpsY,
      vibrationRms,
      steerRate,
      wheelSlip,
      loadTransition,
      gripScore: grip.value,
      gripState: gripStateFor(grip.value),
      confidence: this.conf,
      trend,
      zone,
      reserve: Math.max(0, grip.value - 20),
      stale: false,
    };
  }

  /**
   * Wheel slip from the four measured wheel speeds against vehicle speed. The
   * rolling circumference is not supplied, so it is calibrated from the data
   * itself using high-speed frames where slip is negligible.
   */
  private deriveWheelSlip(frame: LiveFrame): number {
    const rpms = [frame.wheelRpmFL, frame.wheelRpmFR, frame.wheelRpmRL, frame.wheelRpmRR];
    const avgRpm = rpms.reduce((a, b) => a + b, 0) / rpms.length;
    if (frame.speedKmh > 60 && avgRpm > 100) {
      const observed = frame.speedKmh / 3.6 / (avgRpm / 60);
      this.circumferenceSamples += 1;
      // Converging average; settles within the first few seconds of playback.
      this.rollingCircumference +=
        (observed - this.rollingCircumference) / Math.min(this.circumferenceSamples, 500);
    }
    if (frame.speedKmh < 5) return 0;
    const vehicleMs = frame.speedKmh / 3.6;
    const slips = rpms.map((rpm) => {
      const wheelMs = (rpm / 60) * this.rollingCircumference;
      return Math.abs(wheelMs - vehicleMs) / Math.max(1, vehicleMs);
    });
    return Math.min(100, Math.max(...slips) * 100);
  }

  /* ---------- simulated path: circuits with no supplied data ---------- */

  private simulatedTick(): Sample | null {
    this.phase += 1 / this.rateHz;
    const p = this.phase;

    const dropped = Math.random() < 0.004;
    if (dropped) {
      this.lost += 1;
      this.connection = {
        ...this.connection,
        status: "DEGRADED",
        lossPct: (this.lost / Math.max(1, this.packets)) * 100,
      };
      this.pushEvent(
        "ADVISORY",
        "TRANSPORT",
        "PKT_LOSS",
        "Communication degradation",
        `Sequence gap at packet #${this.ticks} — inference confidence reduced`,
      );
      this.conf = Math.max(74, this.conf - 4);
      this.emit();
      return null;
    }

    const circuit = this.circuit;
    const busy = 0.55 + circuit.corners / 26;
    const corner = Math.sin(p * 0.42 * busy) * 0.82 + Math.sin(p * 1.15 * busy) * 0.18;
    const braking = Math.max(0, -Math.cos(p * 0.31)) ** 2;
    const surface = (Math.sin(p * 1.7) * 0.5 + Math.sin(p * 4.3) * 0.25) * (0.5 + circuit.abrasion);

    const ay = corner * 1.55 + surface * 0.12 + (Math.random() - 0.5) * 0.06;
    const ax = braking * -1.35 + Math.max(0, Math.cos(p * 0.31)) * 0.7;
    const wheelSlip = Math.max(0, Math.abs(ay) * 4.1 + braking * 6.2 + surface * 2.1);
    const vibrationRms = 1.2 + Math.abs(surface) * 4.4 + Math.abs(ay) * 1.3 + Math.random() * 0.4;
    const steerRate = Math.abs(Math.cos(p * 0.42 * busy)) * 42 * busy;
    const speed = Math.min(
      339,
      Math.max(
        181,
        262 + Math.cos(p * 0.31) * 66 * (0.7 + circuit.speedFactor * 0.45) + surface * 4,
      ),
    );
    const loadTransition = Math.abs(ax) * 0.35 + Math.abs(ay) * 0.28;

    const distanceDeltaKm = speed / 3600 / this.rateHz;
    const nextDistance = this.track.distanceKm + distanceDeltaKm;
    const nextLap = Math.floor(nextDistance / circuit.lapKm) + 1;
    const progress = (nextDistance % circuit.lapKm) / circuit.lapKm;
    const sector: 1 | 2 | 3 =
      progress < circuit.sectors[0] ? 1 : progress < circuit.sectors[1] ? 2 : 3;
    if (nextLap !== this.track.lap) {
      this.pushEvent(
        "INFO",
        "TRACK",
        "LAP_COMPLETE",
        `Lap ${this.track.lap} complete`,
        `New lap started on ${this.track.name}`,
      );
    }
    this.track = {
      ...this.track,
      distanceKm: nextDistance,
      lap: nextLap,
      progress,
      sector,
      activeTurn: 0,
      turnPhase: "STRAIGHT",
    };

    const spec = COMPOUND_SPEC[this.tires.compound];
    const stintLaps = Math.max(0, nextLap - this.stintStartLap);
    const stintSeconds = Math.max(0, p - this.stintStartPhase);
    const wearRate = (0.55 + circuit.abrasion) * spec.wearRate * this.driver.wearFactor;
    const baseDeg = Math.min(97, (stintLaps * 1.9 + stintSeconds * 0.176) * wearRate);

    const makeCorner = (cornerKey: Corner, bias: number) => {
      const degradation = Math.max(
        0,
        Math.min(
          100,
          baseDeg + bias * spec.wearRate + Math.abs(corner) * (cornerKey[1] === "R" ? 3 : 1),
        ),
      );
      return {
        corner: cornerKey,
        steering: cornerKey[0] === "F" ? corner * 42 : corner * 2.5,
        rideHeight: (cornerKey[0] === "F" ? 34 : 39) + surface * 0.9,
        temperature: 68 + Math.abs(ay) * 14 + braking * 9 + degradation * 0.12 + bias,
        pressure: 1.15 + Math.abs(ay) * 0.03 + degradation * 0.0012,
        wheelRpm: (speed / 3.6 / 1.732) * 60 + bias,
        grip: Math.max(6, spec.startGrip - degradation * 0.78 - wheelSlip * 0.35),
        degradation,
        condition: conditionFor(degradation),
      };
    };
    const corners = {
      FL: makeCorner("FL", 2),
      FR: makeCorner("FR", 5),
      RL: makeCorner("RL", 0),
      RR: makeCorner("RR", 7),
    };
    this.tires = { ...this.tires, stintAgeLaps: stintLaps, corners };
    this.advancePit();

    const worstDeg = Math.max(...CORNERS.map((c) => corners[c].degradation));
    const grip = this.updateGrip(
      { longAccelG: ax, latAccelG: ay } as LiveFrame,
      wheelSlip,
      vibrationRms,
      worstDeg,
    );

    return {
      seq: this.ticks + 1,
      t: this.sessionMs,
      source: "simulated",
      speed,
      ax,
      ay,
      steer: corner * 42,
      steerRear: corner * 2.5,
      steeringFL: corners.FL.steering,
      steeringFR: corners.FR.steering,
      steeringRL: corners.RL.steering,
      steeringRR: corners.RR.steering,
      rideHeightFL: corners.FL.rideHeight,
      rideHeightFR: corners.FR.rideHeight,
      rideHeightRL: corners.RL.rideHeight,
      rideHeightRR: corners.RR.rideHeight,
      tireTempFL: corners.FL.temperature,
      tireTempFR: corners.FR.temperature,
      tireTempRL: corners.RL.temperature,
      tireTempRR: corners.RR.temperature,
      tirePressureFL: corners.FL.pressure,
      tirePressureFR: corners.FR.pressure,
      tirePressureRL: corners.RL.pressure,
      tirePressureRR: corners.RR.pressure,
      wheelRpmFL: corners.FL.wheelRpm,
      wheelRpmFR: corners.FR.wheelRpm,
      wheelRpmRL: corners.RL.wheelRpm,
      wheelRpmRR: corners.RR.wheelRpm,
      brakeFront: braking * 10,
      brakeRear: braking * 7.2,
      wingPressureFront: 101.3 + speed * 0.006,
      wingPressureRear: 101.3 + speed * 0.0045,
      axleLoadFront: 780 - ax * 150,
      axleLoadRear: 945 + ax * 150,
      humidity: 60 + Math.sin(p * 0.05) * 4,
      gpsX: 0,
      gpsY: 0,
      vibrationRms,
      steerRate,
      wheelSlip,
      loadTransition,
      gripScore: grip.value,
      gripState: gripStateFor(grip.value),
      confidence: this.conf,
      trend: this.trendFor(grip.delta),
      zone: this.zoneFor(ax, ay),
      reserve: Math.max(0, grip.value - 20),
      stale: false,
    };
  }

  /* ---------- shared inference ---------- */

  private updateGrip(
    frame: Pick<LiveFrame, "longAccelG" | "latAccelG">,
    wheelSlip: number,
    vibrationRms: number,
    worstDeg: number,
  ): { value: number; delta: number } {
    // Coefficients are sized for race-pace accelerations: lateral reaches ~2.5 g
    // and braking ~4.6 g once the time base is corrected.
    const load =
      Math.abs(frame.latAccelG) * 8 +
      Math.abs(frame.longAccelG) * 4 +
      wheelSlip * 0.8 +
      vibrationRms * 0.5 +
      worstDeg * 0.45;
    const target = Math.max(12, Math.min(97, 108 - load));
    const previous = this.grip;
    this.grip += (target - this.grip) * 0.06;

    const anomaly = wheelSlip > 12 || Math.abs(frame.latAccelG) > 2.2;
    this.conf = Math.max(
      70,
      Math.min(99, this.conf + (96.5 - this.conf) * 0.08 - (anomaly ? 2.2 : 0.15)),
    );

    return { value: this.grip, delta: this.grip - previous };
  }

  private trendFor(delta: number): GripTrend {
    if (delta < -0.28) return "DEGRADING";
    if (delta > 0.28) return this.grip < 60 ? "RECOVERING" : "IMPROVING";
    return "STABLE";
  }

  private zoneFor(ax: number, ay: number): Zone {
    if (Math.abs(ax) > 1.5) return ax < 0 ? "FRONT_AXLE" : "REAR_AXLE";
    if (Math.abs(ay) > 0.9) return ay > 0 ? "RIGHT" : "LEFT";
    return "BALANCED";
  }

  private advancePit() {
    if (this.pit.status !== "REQUESTED" || this.pit.requestedAt === null) return;
    // Session clock, so a paused run does not silently finish its pit stop.
    const countdownMs = Math.max(0, this.pitDurationMs - (this.sessionMs - this.pit.requestedAt));
    this.pit = { ...this.pit, countdownMs };
    if (countdownMs === 0) this.completePit();
  }

  private updateStrategy() {
    const worstDeg = Math.max(...CORNERS.map((c) => this.tires.corners[c].degradation));
    const avgTemp = CORNERS.reduce((sum, c) => sum + this.tires.corners[c].temperature, 0) / 4;
    const pitWindow = worstDeg >= 58 ? "OPEN" : worstDeg >= 42 ? "APPROACHING" : "CLOSED";
    const ranking = rankCompounds(this.circuit, worstDeg, avgTemp, this.tires.stintAgeLaps);
    const best = ranking[0]!;

    const rawConf = Math.max(
      78,
      Math.min(99, this.conf - Math.min(10, this.latest?.wheelSlip ?? 0)),
    );
    const nowMs = Date.now();
    if (nowMs - this.strategyConfAt >= 1000) {
      this.strategyConfAt = nowMs;
      this.strategyConf += (rawConf - this.strategyConf) * 0.5;
    }

    this.strategy = {
      pitWindow,
      recommendedLap:
        this.track.lap + (pitWindow === "OPEN" ? 1 : pitWindow === "APPROACHING" ? 3 : 7),
      recommendedCompound: best.compound,
      reason:
        worstDeg >= 58
          ? "Tire degradation is accelerating"
          : worstDeg >= 42
            ? "Grip trend is approaching the service threshold"
            : "Tire condition remains inside the operating window",
      expectedBenefit:
        worstDeg >= 58
          ? "Restore stability and protect lap time"
          : "Extend the current stint without avoidable pit loss",
      confidence: Math.round(this.strategyConf),
      finalCompound: best.compound,
      finalReason: `${best.note} · worst corner at ${worstDeg.toFixed(0)}% wear, tires averaging ${avgTemp.toFixed(0)} °C`,
      ranking,
    };
  }

  private updateDiagnostics(sample: Sample) {
    this.health = {
      ...this.health,
      boardTemp: 40 + Math.abs(sample.ay) * 6 + sample.vibrationRms * 0.2,
      supplyVoltage: 13.9 - sample.brakeFront * 0.03,
      can: this.connection.lossPct > 1.2 ? "DEGRADED" : "OK",
    };
    this.connection = {
      ...this.connection,
      status: this.connection.lossPct > 2 ? "DEGRADED" : "CONNECTED",
      packetRate: this.rateHz,
      latencyMs: this.isMeasured ? 0 : 6 + Math.random() * 5,
      lossPct: (this.lost / Math.max(1, this.packets)) * 100,
      source: sample.source,
    };
    this.session = {
      ...this.session,
      durationMs: sample.t,
      packets: this.packets,
      lossPct: this.connection.lossPct,
      source: sample.source,
      sourceRange: this.isMeasured
        ? { startSeq: this.startSeq, endSeq: Math.max(this.startSeq, this.playSeq) }
        : null,
    };
  }

  private raiseEvents(sample: Sample) {
    const cfg = getSettings();
    if (sample.trend === "DEGRADING" && sample.gripScore < cfg.degradingGrip) {
      this.pushEvent(
        "WARNING",
        "GRIP",
        "GRIP_DEGRADING",
        "Grip degrading",
        `Score ${sample.gripScore.toFixed(1)} · dominant zone ${sample.zone}`,
      );
    }
    if (sample.steerRate > cfg.steerRateWarn && Math.abs(sample.ay) > cfg.latAccelWarn) {
      this.pushEvent(
        "CRITICAL",
        "STABILITY",
        "INSTABILITY",
        "Instability detected",
        `Steering rate ${sample.steerRate.toFixed(0)} °/s at ${Math.abs(sample.ay).toFixed(2)} g lateral`,
      );
    }
    if (sample.vibrationRms > cfg.vibrationInfo) {
      this.pushEvent(
        "INFO",
        "SURFACE",
        "SURFACE_DISTURB",
        "Surface disturbance",
        `Vibration RMS ${sample.vibrationRms.toFixed(2)} m/s² — context only, not classified as instability`,
      );
    }
    if (sample.trend === "RECOVERING") {
      this.pushEvent(
        "ADVISORY",
        "GRIP",
        "GRIP_RECOVER",
        "Grip recovering",
        "Transition toward stable behavioural region",
      );
    }
    if (sample.confidence < cfg.confidenceWarn) {
      this.pushEvent(
        "WARNING",
        "SENSOR",
        "SENSOR_DISAGREE",
        "Sensor disagreement",
        `Inference confidence ${sample.confidence.toFixed(0)}% — source: wheel speed vs vehicle speed`,
      );
    }
    if (sample.wheelSlip > cfg.wheelSlipWarn) {
      this.pushEvent(
        "WARNING",
        "TIRE",
        "WHEEL_SLIP",
        "Wheel slip detected",
        `${sample.wheelSlip.toFixed(1)}% disagreement between wheel speed and vehicle speed`,
      );
    }
    if (this.strategy.pitWindow === "OPEN") {
      this.pushEvent(
        "WARNING",
        "STRATEGY",
        "PIT_WINDOW",
        "Pit window open",
        `${this.strategy.recommendedCompound} recommended on lap ${this.strategy.recommendedLap}`,
      );
    }
  }

  /** Highest-severity event within the last 8 s, or the most recent one. */
  get activeEvent(): TelemetryEvent | null {
    const first = this.events[0];
    if (!first) return null;
    const now = this.latest?.t ?? 0;
    const recent = this.events.filter((e) => now - e.t < 8000);
    const pool: TelemetryEvent[] = recent.length ? recent : [first];
    return pool.reduce<TelemetryEvent>(
      (a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a),
      pool[0]!,
    );
  }

  /** Persists the current run to MongoDB so Replay/Analysis can load it later. */
  async saveSession(label = ""): Promise<RecordedSession | null> {
    if (!this.history.length) return null;

    const meta: SessionMeta = { ...this.session, endedAt: Date.now() };
    const step = Math.max(1, Math.ceil(this.history.length / SAVED_SAMPLE_LIMIT));
    const samples = this.history.filter((_, i) => i % step === 0);

    const sampleColumns = Object.keys(samples[0]!).filter(
      (key) => typeof samples[0]![key as keyof Sample] === "number",
    );

    const body = {
      runId: meta.id,
      label,
      circuitId: this.circuit.id,
      driverId: this.driver.id,
      driverName: this.driver.name,
      compound: this.tires.compound,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt,
      durationMs: meta.durationMs,
      sourceRange: meta.sourceRange,
      protocolVersion: meta.protocolVersion,
      softwareVersion: meta.softwareVersion,
      sampleColumns,
      samples: samples.map((s) => sampleColumns.map((key) => Number(s[key as keyof Sample] ?? 0))),
      events: this.events.map((e) => ({
        t: e.t,
        severity: e.severity,
        category: e.category,
        code: e.code,
        title: e.title,
        detail: e.detail,
      })),
      pitHistory: this.pit.history as unknown as Record<string, unknown>[],
    };

    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { message?: string } | null;
      this.pushEvent(
        "WARNING",
        "TRANSPORT",
        "RUN_SAVE_FAILED",
        "Could not save run",
        detail?.message ?? `Server replied ${response.status}`,
      );
      this.emit();
      throw new Error(detail?.message ?? `Save failed (${response.status})`);
    }

    this.session = meta;
    this.pushEvent(
      "INFO",
      "TRANSPORT",
      "RUN_SAVED",
      "Run saved",
      `${meta.id} · ${samples.length} samples stored in MongoDB`,
    );
    this.emit();
    return { meta, samples, events: this.events, pitHistory: this.pit.history };
  }
}

/* ---------- saved-run access (MongoDB via the API) ---------- */

export interface RunSummary {
  runId: string;
  label: string;
  circuitId: string;
  driverId: string;
  driverName: string;
  compound: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  sampleCount: number;
  sourceRange: { startSeq: number; endSeq: number } | null;
  protocolVersion: string;
  softwareVersion: string;
}

export async function listSessions(): Promise<RunSummary[]> {
  const response = await fetch("/api/runs");
  if (!response.ok) throw new Error(`Could not list runs (${response.status})`);
  const body = (await response.json()) as { runs: RunSummary[] };
  return body.runs;
}

/** Loads one saved run and rebuilds its samples from the stored tuples. */
export async function loadSession(runId: string): Promise<RecordedSession | null> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not load run (${response.status})`);

  const doc = (await response.json()) as {
    runId: string;
    circuitId: string;
    startedAt: number;
    endedAt: number | null;
    durationMs: number;
    sourceRange: { startSeq: number; endSeq: number } | null;
    protocolVersion: string;
    softwareVersion: string;
    sampleCount: number;
    sampleColumns: string[];
    samples: number[][];
    events: Omit<TelemetryEvent, "id" | "wallClock">[];
    pitHistory: RecordedSession["pitHistory"];
  };

  const samples = doc.samples.map((row) => {
    const sample: Record<string, unknown> = {
      source: "measured",
      gripState: "MEDIUM",
      trend: "STABLE",
      zone: "BALANCED",
      stale: false,
    };
    doc.sampleColumns.forEach((key, i) => {
      sample[key] = row[i] ?? 0;
    });
    return sample as unknown as Sample;
  });

  return {
    meta: {
      id: doc.runId,
      profile: "TRACK / DRY-BASELINE",
      startedAt: doc.startedAt,
      endedAt: doc.endedAt,
      protocolVersion: doc.protocolVersion,
      softwareVersion: doc.softwareVersion,
      durationMs: doc.durationMs,
      packets: doc.sampleCount,
      lossPct: 0,
      source: doc.sourceRange ? "measured" : "simulated",
      sourceRange: doc.sourceRange,
    },
    samples,
    events: doc.events.map((e, i) => ({
      ...e,
      id: `EV-${i}`,
      wallClock: doc.startedAt + e.t,
    })) as TelemetryEvent[],
    pitHistory: doc.pitHistory,
  };
}

export async function deleteSession(runId: string): Promise<void> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not delete run (${response.status})`);
  }
}

export function sessionToCsv(session: RecordedSession): string {
  const first = session.samples[0];
  if (!first) return "";
  const keys = Object.keys(first);
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = session.samples.map((s) =>
    keys.map((k) => escape((s as unknown as Record<string, unknown>)[k])).join(","),
  );
  return [
    `# session=${session.meta.id} protocol=${session.meta.protocolVersion} software=${session.meta.softwareVersion} source=${session.meta.source}`,
    keys.join(","),
    ...rows,
  ].join("\n");
}

export const engine = new TelemetryEngine();
