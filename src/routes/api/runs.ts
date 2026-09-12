import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { describeMongoFailure, runs as runsCollection } from "@/lib/db/mongo.server";
import type { RunDoc } from "@/lib/db/schema";

/**
 * Saved runs live in MongoDB rather than localStorage. A full run is a few MB
 * of samples, which blew the browser's ~5 MB origin quota on the second save.
 */

/** Defensive ceiling so one request cannot push an oversized BSON document. */
const MAX_SAMPLES = 4000;
const MAX_EVENTS = 500;

const eventSchema = z.object({
  t: z.number(),
  severity: z.string().max(32),
  category: z.string().max(32),
  code: z.string().max(64),
  title: z.string().max(200),
  detail: z.string().max(500),
});

const runSchema = z.object({
  runId: z.string().min(1).max(64),
  label: z.string().max(120).default(""),
  circuitId: z.string().max(64),
  driverId: z.string().max(64),
  driverName: z.string().max(120),
  compound: z.string().max(32),
  startedAt: z.number(),
  endedAt: z.number().nullable().default(null),
  durationMs: z.number().nonnegative(),
  sourceRange: z
    .object({ startSeq: z.number().int().nonnegative(), endSeq: z.number().int().nonnegative() })
    .nullable()
    .default(null),
  protocolVersion: z.string().max(32),
  softwareVersion: z.string().max(64),
  sampleColumns: z.array(z.string().max(48)).max(80),
  samples: z.array(z.array(z.number())).max(MAX_SAMPLES),
  events: z.array(eventSchema).max(MAX_EVENTS).default([]),
  pitHistory: z.array(z.record(z.unknown())).max(50).default([]),
});

export const Route = createFileRoute("/api/runs")({
  server: {
    handlers: {
      /** List saved runs, newest first, without their sample payloads. */
      GET: async () => {
        try {
          const collection = await runsCollection();
          const docs = await collection
            .find(
              {},
              {
                projection: { samples: 0, events: 0, pitHistory: 0 },
                sort: { startedAt: -1 },
                limit: 50,
              },
            )
            .toArray();

          return Response.json({
            runs: docs.map((doc) => ({
              runId: doc.runId,
              label: doc.label,
              circuitId: doc.circuitId,
              driverId: doc.driverId,
              driverName: doc.driverName,
              compound: doc.compound,
              startedAt:
                doc.startedAt instanceof Date ? doc.startedAt.getTime() : Number(doc.startedAt),
              endedAt: doc.endedAt instanceof Date ? doc.endedAt.getTime() : (doc.endedAt ?? null),
              durationMs: doc.durationMs,
              sampleCount: doc.sampleCount,
              sourceRange: doc.sourceRange,
              protocolVersion: doc.protocolVersion,
              softwareVersion: doc.softwareVersion,
            })),
          });
        } catch (error) {
          console.error(error);
          return Response.json(
            { error: "mongo_unavailable", message: describeMongoFailure(error) },
            { status: 503 },
          );
        }
      },

      /** Save (or overwrite) one run. */
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }

        const parsed = runSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "invalid_run", issues: parsed.error.issues.slice(0, 10) },
            { status: 400 },
          );
        }

        const input = parsed.data;
        const doc: RunDoc = {
          runId: input.runId,
          label: input.label,
          circuitId: input.circuitId,
          driverId: input.driverId,
          driverName: input.driverName,
          compound: input.compound,
          startedAt: new Date(input.startedAt),
          endedAt: input.endedAt === null ? null : new Date(input.endedAt),
          durationMs: input.durationMs,
          sourceRange: input.sourceRange,
          protocolVersion: input.protocolVersion,
          softwareVersion: input.softwareVersion,
          sampleCount: input.samples.length,
          sampleColumns: input.sampleColumns,
          samples: input.samples,
          events: input.events,
          pitHistory: input.pitHistory,
        };

        try {
          const collection = await runsCollection();
          await collection.replaceOne({ runId: doc.runId }, doc, { upsert: true });
          return Response.json({ runId: doc.runId, sampleCount: doc.sampleCount }, { status: 201 });
        } catch (error) {
          console.error(error);
          return Response.json(
            { error: "mongo_unavailable", message: describeMongoFailure(error) },
            { status: 503 },
          );
        }
      },
    },
  },
});
