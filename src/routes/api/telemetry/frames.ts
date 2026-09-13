import { createFileRoute } from "@tanstack/react-router";

import { describeMongoFailure, frames as framesCollection } from "@/lib/db/mongo.server";
import {
  FRAME_COLUMNS,
  TURN_PHASES,
  encodeFrame,
  type FrameChunkPayload,
} from "@/lib/telemetry/frames";

/** One request may not pull more than ~2 minutes of 24 Hz data. */
const MAX_COUNT = 3000;
const DEFAULT_COUNT = 1440; // 60 s at 24 Hz

/**
 * The frame total is fixed for a given seed, so it is resolved once per warm
 * instance instead of costing a round trip on every chunk request.
 */
let frameCountCache: number | null = null;

async function cachedFrameCount(
  collection: Awaited<ReturnType<typeof framesCollection>>,
): Promise<number> {
  if (frameCountCache === null) {
    frameCountCache = await collection.estimatedDocumentCount();
  }
  return frameCountCache;
}

function intParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * `GET /api/telemetry/frames?from=<seq>&count=<n>`
 *
 * Returns a contiguous chunk of frames in the compact tuple encoding. The
 * client plays a chunk locally at 24 Hz and prefetches the next one, so
 * playback never waits on the network.
 */
export const Route = createFileRoute("/api/telemetry/frames")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const from = Math.max(0, intParam(url.searchParams.get("from"), 0));
        const count = Math.min(
          MAX_COUNT,
          Math.max(1, intParam(url.searchParams.get("count"), DEFAULT_COUNT)),
        );

        try {
          const collection = await framesCollection();
          const [docs, frameCount] = await Promise.all([
            collection
              .find({ _id: { $gte: from, $lt: from + count } })
              .sort({ _id: 1 })
              .toArray(),
            cachedFrameCount(collection),
          ]);

          if (!frameCount) {
            return Response.json(
              {
                error: "not_seeded",
                message: "No Silverstone data in MongoDB. Run: npm run seed",
              },
              { status: 503 },
            );
          }

          const payload: FrameChunkPayload = {
            columns: FRAME_COLUMNS,
            phases: TURN_PHASES,
            from,
            count: docs.length,
            frameCount,
            frames: docs.map(encodeFrame),
          };

          return Response.json(payload, {
            // Chunk URLs carry the seed version (`&v=`), so a given URL can never
            // return different bytes — safe to cache for a year at the edge. A
            // reseed changes the version and therefore the URL.
            headers: { "cache-control": "public, max-age=31536000, immutable" },
          });
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
