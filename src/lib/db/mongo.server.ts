import { MongoClient, type Db, type Collection } from "mongodb";

import type {
  DriverProfileDoc,
  FrameDoc,
  LapSummaryDoc,
  RunDoc,
  TrackMetaDoc,
  TurnDoc,
} from "./schema";

const DEFAULT_URI = "mongodb://127.0.0.1:27017";
const DEFAULT_DB = "slipstream-x";

/**
 * Vite reloads server modules on every edit, so the client is parked on
 * globalThis — otherwise each HMR pass would open a fresh connection pool and
 * leak sockets until Mongo refuses new connections.
 */
const globalForMongo = globalThis as typeof globalThis & {
  __slipstreamMongo?: Promise<MongoClient>;
};

function connectionUri(): string {
  return process.env["MONGODB_URI"] ?? DEFAULT_URI;
}

function databaseName(): string {
  return process.env["MONGODB_DB"] ?? DEFAULT_DB;
}

export function getMongoClient(): Promise<MongoClient> {
  if (!globalForMongo.__slipstreamMongo) {
    const client = new MongoClient(connectionUri(), {
      // Fail fast in dev instead of hanging the SSR render for 30 s when the
      // local mongod is not running.
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    globalForMongo.__slipstreamMongo = client.connect();
  }
  return globalForMongo.__slipstreamMongo;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(databaseName());
}

export async function frames(): Promise<Collection<FrameDoc>> {
  return (await getDb()).collection<FrameDoc>("silverstone_frames");
}

export async function turns(): Promise<Collection<TurnDoc>> {
  return (await getDb()).collection<TurnDoc>("silverstone_turns");
}

export async function lapSummaries(): Promise<Collection<LapSummaryDoc>> {
  return (await getDb()).collection<LapSummaryDoc>("silverstone_laps");
}

export async function trackMeta(): Promise<Collection<TrackMetaDoc>> {
  return (await getDb()).collection<TrackMetaDoc>("silverstone_meta");
}

export async function runs(): Promise<Collection<RunDoc>> {
  return (await getDb()).collection<RunDoc>("runs");
}

export async function driverProfiles(): Promise<Collection<DriverProfileDoc>> {
  return (await getDb()).collection<DriverProfileDoc>("driver_profiles");
}

/** Describes why a database call failed without leaking the connection string. */
export function describeMongoFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ECONNREFUSED|server selection|topology/i.test(message)) {
    return "Cannot reach MongoDB. Start the local mongod service, or set MONGODB_URI.";
  }
  return message;
}
