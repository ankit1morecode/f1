// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Build target for Nitro.
 *
 * The API routes talk to MongoDB, and the driver needs raw TCP sockets plus Node
 * built-ins that the default cloudflare-module preset cannot provide — bundling
 * it there fails on `require("punycode/")` inside whatwg-url. So this must never
 * fall back to Cloudflare.
 *
 * Vercel sets VERCEL=1 during its builds; NITRO_PRESET overrides everything, so
 * any other host can still be targeted without editing this file. Locally it
 * stays node-server, which `npx vite preview` runs directly.
 */
function nitroPreset(): string {
  const explicit = process.env["NITRO_PRESET"];
  if (explicit) return explicit;
  return process.env["VERCEL"] ? "vercel" : "node-server";
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: { preset: nitroPreset() },
});
