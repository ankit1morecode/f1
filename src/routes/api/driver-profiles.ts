import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { describeMongoFailure, driverProfiles } from "@/lib/db/mongo.server";

/**
 * Driver profiles live in MongoDB rather than localStorage: an uploaded photo
 * is shared by everyone who opens the console, so the record pointing at it has
 * to be shared too.
 */

const profileSchema = z.object({
  driverId: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(600).default(""),
  photoUrl: z.string().max(2000).default(""),
  photoFileId: z.string().max(200).nullable().default(null),
});

/** Only http(s) URLs may be stored — a `javascript:` href must never be persisted. */
function isSafeImageUrl(url: string): boolean {
  if (!url) return true;
  if (url.startsWith("/")) return true;
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/driver-profiles")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const collection = await driverProfiles();
          const docs = await collection.find({}).toArray();
          return Response.json({
            profiles: docs.map((doc) => ({
              driverId: doc._id,
              name: doc.name,
              photoUrl: doc.photoUrl,
              description: doc.description,
              photoFileId: doc.photoFileId,
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

      PUT: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }

        const parsed = profileSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "invalid_profile", issues: parsed.error.issues.slice(0, 10) },
            { status: 400 },
          );
        }

        const input = parsed.data;
        if (!isSafeImageUrl(input.photoUrl)) {
          return Response.json(
            { error: "invalid_photo_url", message: "Photo links must be http(s)." },
            { status: 400 },
          );
        }

        try {
          const collection = await driverProfiles();
          await collection.replaceOne(
            { _id: input.driverId },
            {
              // `_id` comes from the filter; the driver plugin rejects it here.
              name: input.name,
              description: input.description,
              photoUrl: input.photoUrl,
              photoFileId: input.photoFileId,
              updatedAt: new Date(),
            },
            { upsert: true },
          );
          return Response.json({ driverId: input.driverId, saved: true });
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
