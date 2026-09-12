import { createFileRoute } from "@tanstack/react-router";

import { describeMongoFailure, runs as runsCollection } from "@/lib/db/mongo.server";

/** Fetch or delete a single saved run, including its sample payload. */
export const Route = createFileRoute("/api/runs/$runId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const collection = await runsCollection();
          const doc = await collection.findOne({ runId: params.runId }, { projection: { _id: 0 } });
          if (!doc) return Response.json({ error: "not_found" }, { status: 404 });

          return Response.json({
            ...doc,
            startedAt:
              doc.startedAt instanceof Date ? doc.startedAt.getTime() : Number(doc.startedAt),
            endedAt: doc.endedAt instanceof Date ? doc.endedAt.getTime() : (doc.endedAt ?? null),
          });
        } catch (error) {
          console.error(error);
          return Response.json(
            { error: "mongo_unavailable", message: describeMongoFailure(error) },
            { status: 503 },
          );
        }
      },

      DELETE: async ({ params }) => {
        try {
          const collection = await runsCollection();
          const result = await collection.deleteOne({ runId: params.runId });
          if (!result.deletedCount) {
            return Response.json({ error: "not_found" }, { status: 404 });
          }
          return Response.json({ runId: params.runId, deleted: true });
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
