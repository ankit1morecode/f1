import {
  decodeFrame,
  type FrameChunkPayload,
  type FrameRow,
  type LiveFrame,
  type TelemetryMetaPayload,
} from "./frames";

/**
 * Streams the supplied Silverstone dataset out of MongoDB in 60-second chunks.
 *
 * The engine ticks locally at the dataset's own 24 Hz and asks this source for
 * the frame it needs; the source keeps the surrounding chunks resident and
 * fetches the next one ahead of time, so playback never stalls on the network.
 * Nothing is bundled — the 27 MB source CSV stays in the database.
 */

/** 60 s at 24 Hz. Matches the API's default page size. */
export const CHUNK_FRAMES = 1440;
/** Start fetching the next chunk once this close to its boundary. */
const PREFETCH_MARGIN = 240; // 10 s
/** Chunks kept in memory (~1.8 MB of numbers). */
const MAX_RESIDENT_CHUNKS = 4;

export type FrameSourceStatus = "idle" | "loading" | "ready" | "error";

function chunkIndexFor(seq: number): number {
  return Math.floor(seq / CHUNK_FRAMES);
}

class FrameSource {
  private chunks = new Map<number, FrameRow[]>();
  private inFlight = new Map<number, Promise<void>>();
  private listeners = new Set<() => void>();

  meta: TelemetryMetaPayload | null = null;
  status: FrameSourceStatus = "idle";
  error: string | null = null;

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  get frameCount(): number {
    return this.meta?.frameCount ?? 0;
  }

  get samplingHz(): number {
    return this.meta?.samplingHz ?? 24;
  }

  /** Fetches track metadata plus the first chunk. Safe to call repeatedly. */
  async load(): Promise<void> {
    if (this.status === "loading" || this.status === "ready") return;
    this.status = "loading";
    this.error = null;
    this.emit();

    try {
      const response = await fetch("/api/telemetry/meta");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Metadata request failed (${response.status})`);
      }
      this.meta = (await response.json()) as TelemetryMetaPayload;
      await this.fetchChunk(0);
      this.status = "ready";
    } catch (error) {
      this.status = "error";
      this.error = error instanceof Error ? error.message : String(error);
    }
    this.emit();
  }

  private async fetchChunk(index: number): Promise<void> {
    if (this.chunks.has(index)) return;
    const existing = this.inFlight.get(index);
    if (existing) return existing;

    const from = index * CHUNK_FRAMES;
    const request = (async () => {
      try {
        // Chunks are served `immutable`, so the seed version has to be part of
        // the URL — otherwise a reseed keeps serving stale frames for an hour.
        const version = this.meta?.version ?? "0";
        const response = await fetch(
          `/api/telemetry/frames?from=${from}&count=${CHUNK_FRAMES}&v=${version}`,
        );
        if (!response.ok) throw new Error(`Frame request failed (${response.status})`);
        const payload = (await response.json()) as FrameChunkPayload;
        this.chunks.set(index, payload.frames);
        this.evict(index);
        this.emit();
      } catch (error) {
        // A failed chunk is not fatal: the engine holds the last good frame and
        // the fetch is retried the next time that chunk is needed.
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.inFlight.delete(index);
      }
    })();

    this.inFlight.set(index, request);
    return request;
  }

  /** Drops chunks far from the playhead so memory stays bounded. */
  private evict(around: number) {
    if (this.chunks.size <= MAX_RESIDENT_CHUNKS) return;
    for (const index of [...this.chunks.keys()]) {
      if (Math.abs(index - around) > 1) this.chunks.delete(index);
      if (this.chunks.size <= MAX_RESIDENT_CHUNKS) break;
    }
  }

  /**
   * Returns the frame at `seq` if resident, otherwise null, and schedules the
   * fetches needed to have it (and the frames just after it) available.
   */
  frameAt(seq: number): LiveFrame | null {
    if (!this.meta) return null;
    const total = this.meta.frameCount;
    if (total <= 0) return null;

    const wrapped = ((seq % total) + total) % total;
    const index = chunkIndexFor(wrapped);
    const offsetInChunk = wrapped - index * CHUNK_FRAMES;

    if (offsetInChunk >= CHUNK_FRAMES - PREFETCH_MARGIN) {
      const nextStart = (index + 1) * CHUNK_FRAMES;
      void this.fetchChunk(nextStart >= total ? 0 : index + 1);
    }

    const chunk = this.chunks.get(index);
    if (!chunk) {
      void this.fetchChunk(index);
      return null;
    }

    const row = chunk[offsetInChunk];
    return row ? decodeFrame(row) : null;
  }

  /** Warms the chunks around a seek target. */
  prefetchAround(seq: number) {
    if (!this.meta) return;
    void this.fetchChunk(chunkIndexFor(seq));
  }

  reset() {
    this.chunks.clear();
    this.inFlight.clear();
    this.meta = null;
    this.status = "idle";
    this.error = null;
    this.emit();
  }
}

export const frameSource = new FrameSource();
