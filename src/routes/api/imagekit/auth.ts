import { createFileRoute } from "@tanstack/react-router";
import { createHmac, randomUUID } from "node:crypto";

/**
 * Mints a short-lived ImageKit upload signature.
 *
 * The browser uploads straight to ImageKit, which keeps a multi-megabyte photo
 * off this server entirely — but that only works if the client can prove the
 * upload was authorised. ImageKit's scheme is an HMAC-SHA1 of `token + expire`
 * keyed with the private key, so the private key stays here and only the
 * signature, the token, the expiry and the *public* key ever reach the browser.
 *
 * Never return IMAGEKIT_PRIVATE_KEY in this payload, and never move it to a
 * `VITE_`-prefixed variable — those are inlined into the client bundle.
 */

/** ImageKit rejects anything more than an hour out; keep the window short. */
const TOKEN_TTL_SECONDS = 10 * 60;

/**
 * Destination folder. This account's upload API rejects a leading slash and
 * rejects hyphens in the path, so it has to be relative and underscored —
 * "/slipstream-x/drivers" comes back as "invalid value for folder parameter".
 */
const UPLOAD_FOLDER = "slipstream_x/drivers";

export const Route = createFileRoute("/api/imagekit/auth")({
  server: {
    handlers: {
      GET: () => {
        const privateKey = process.env["IMAGEKIT_PRIVATE_KEY"];
        const publicKey = process.env["IMAGEKIT_PUBLIC_KEY"];
        const urlEndpoint = process.env["IMAGEKIT_URL_ENDPOINT"];

        if (!privateKey || !publicKey || !urlEndpoint) {
          return Response.json(
            {
              error: "imagekit_not_configured",
              message:
                "Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT in .env",
            },
            { status: 503 },
          );
        }

        const token = randomUUID();
        const expire = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
        const signature = createHmac("sha1", privateKey)
          .update(token + expire)
          .digest("hex");

        return Response.json(
          { token, expire, signature, publicKey, urlEndpoint, folder: UPLOAD_FOLDER },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
