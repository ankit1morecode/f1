import { useEffect, useState } from "react";
import { DRIVERS } from "./drivers";
import driver1Photo from "@/assets/driver-1.jpg";
import driver2Photo from "@/assets/driver-2.jpg";

/** Editable, presentation-only profile for a driver. */
export interface DriverProfile {
  name: string;
  photoUrl: string;
  description: string;
  /** ImageKit fileId when the photo was uploaded rather than linked. */
  photoFileId: string | null;
}

/**
 * Profiles are stored in MongoDB, not in the browser.
 *
 * An uploaded photo lives on ImageKit and is visible to everyone who opens the
 * console, so the record pointing at it has to be shared too — keeping it in
 * localStorage would have shown the new photo only to whoever uploaded it.
 *
 * Writes are optimistic: the local cache updates immediately so typing stays
 * responsive, and the PUT follows.
 */
export const DEFAULT_DRIVER_PROFILES: Record<string, DriverProfile> = {
  [DRIVERS[0]!.id]: {
    name: DRIVERS[0]!.name,
    photoUrl: driver1Photo,
    description: DRIVERS[0]!.style,
    photoFileId: null,
  },
  [DRIVERS[1]!.id]: {
    name: DRIVERS[1]!.name,
    photoUrl: driver2Photo,
    description: DRIVERS[1]!.style,
    photoFileId: null,
  },
};

const listeners = new Set<() => void>();
let current: Record<string, DriverProfile> = { ...DEFAULT_DRIVER_PROFILES };
let loaded: Promise<void> | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function fallback(driverId: string): DriverProfile {
  return DEFAULT_DRIVER_PROFILES[driverId] ?? DEFAULT_DRIVER_PROFILES[DRIVERS[0]!.id]!;
}

/** Fetches stored profiles once per page load and merges them over the defaults. */
export function loadDriverProfiles(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    try {
      const response = await fetch("/api/driver-profiles");
      if (!response.ok) return;
      const body = (await response.json()) as {
        profiles: (DriverProfile & { driverId: string })[];
      };
      const merged: Record<string, DriverProfile> = { ...DEFAULT_DRIVER_PROFILES };
      for (const profile of body.profiles) {
        merged[profile.driverId] = {
          name: profile.name || fallback(profile.driverId).name,
          // A stored profile that never set a photo keeps the bundled portrait.
          photoUrl: profile.photoUrl || fallback(profile.driverId).photoUrl,
          description: profile.description,
          photoFileId: profile.photoFileId ?? null,
        };
      }
      current = merged;
      notify();
    } catch {
      /* offline or no database — the defaults remain usable */
    }
  })();
  return loaded;
}

export function getDriverProfile(driverId: string): DriverProfile {
  return current[driverId] ?? fallback(driverId);
}

export async function updateDriverProfile(driverId: string, patch: Partial<DriverProfile>) {
  const next = { ...getDriverProfile(driverId), ...patch };
  current = { ...current, [driverId]: next };
  notify();

  const response = await fetch("/api/driver-profiles", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      driverId,
      name: next.name,
      description: next.description,
      photoUrl: next.photoUrl,
      photoFileId: next.photoFileId,
    }),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Could not save the profile (${response.status})`);
  }
}

export async function resetDriverProfiles() {
  current = { ...DEFAULT_DRIVER_PROFILES };
  notify();
  await Promise.all(
    Object.entries(DEFAULT_DRIVER_PROFILES).map(([driverId, profile]) =>
      fetch("/api/driver-profiles", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ driverId, ...profile, photoUrl: "" }),
      }),
    ),
  );
}

/** Hydration-safe: starts from defaults, adopts stored values after mount. */
export function useDriverProfile(driverId: string): DriverProfile {
  const [profile, setProfile] = useState<DriverProfile>(() => fallback(driverId));

  useEffect(() => {
    const sync = () => setProfile(getDriverProfile(driverId));
    listeners.add(sync);
    void loadDriverProfiles().then(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, [driverId]);

  return profile;
}
