import { createFileRoute } from "@tanstack/react-router";

import { describeMongoFailure, lapSummaries, trackMeta, turns } from "@/lib/db/mongo.server";
import type { LapInfo, TelemetryMetaPayload, TurnInfo } from "@/lib/telemetry/frames";

/**
 * Everything the client needs before playback starts: track dimensions, the
 * 18 turn markers, per-lap rollups computed in the database, and a decimated
 * racing line so the map can draw without downloading 104 680 frames.
 */
export const Route = createFileRoute("/api/telemetry/meta")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const [metaCollection, turnsCollection, lapsCollection] = await Promise.all([
            trackMeta(),
            turns(),
            lapSummaries(),
          ]);

          const meta = await metaCollection.findOne({ _id: "silverstone" });
          if (!meta) {
            return Response.json(
              {
                error: "not_seeded",
                message: "No Silverstone data in MongoDB. Run: npm run seed",
              },
              { status: 503 },
            );
          }

          const [turnDocs, lapDocs] = await Promise.all([
            turnsCollection.find({}).sort({ number: 1 }).toArray(),
            lapsCollection.find({}).sort({ lap: 1 }).toArray(),
          ]);

          const payload: TelemetryMetaPayload = {
            track: meta.track,
            circuitId: meta.circuitId,
            samplingHz: meta.samplingHz,
            frameCount: meta.frameCount,
            lapCount: meta.lapCount,
            framesPerLap: meta.framesPerLap,
            lapDistanceM: meta.lapDistanceM,
            lapDurationS: meta.lapDurationS,
            totalDurationS: meta.totalDurationS,
            gpsBounds: meta.gpsBounds,
            racingLine: meta.racingLine,
            source: meta.source,
            turns: turnDocs.map((t): TurnInfo => ({
              number: t.number,
              turn: t.turn,
              distanceM: t.distanceM,
              direction: t.direction,
              severity: t.severity,
            })),
            laps: lapDocs.map((l): LapInfo => ({
              lap: l.lap,
              frames: l.frames,
              durationS: l.durationS,
              avgSpeedKmh: l.avgSpeedKmh,
              maxSpeedKmh: l.maxSpeedKmh,
              minSpeedKmh: l.minSpeedKmh,
              maxTireTempC: l.maxTireTempC,
              avgTirePressureBar: l.avgTirePressureBar,
              peakLatAccelG: l.peakLatAccelG,
              peakLongAccelG: l.peakLongAccelG,
              peakBrakeBar: l.peakBrakeBar,
              avgHumidityPct: l.avgHumidityPct,
              startSeq: l.startSeq,
              endSeq: l.endSeq,
            })),
          };

          return Response.json(payload, {
            headers: { "cache-control": "public, max-age=300" },
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
