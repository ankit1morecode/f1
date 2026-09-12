import type { TireCompound } from "./types";

export interface Driver {
  id: string;
  name: string;
  shortName: string;
  carNumber: number;
  carName: string;
  country: string;
  /** >1 = harder on the tires, <1 = gentler. */
  wearFactor: number;
  style: string;
}

export const DRIVERS: Driver[] = [
  {
    id: "d1",
    name: "Aarav Mehta",
    shortName: "MEH",
    carNumber: 20,
    carName: "TGR-01 Signal Red",
    country: "India",
    wearFactor: 1.08,
    style: "Aggressive on entry — heats the front tires quickly.",
  },
  {
    id: "d2",
    name: "Lars Nyström",
    shortName: "NYS",
    carNumber: 27,
    carName: "TGR-02 Carbon",
    country: "Sweden",
    wearFactor: 0.93,
    style: "Smooth and patient — protects the rear tires for longer stints.",
  },
];

export function driverById(id: string): Driver {
  return DRIVERS.find((d) => d.id === id) ?? DRIVERS[0]!;
}

/** Compound behaviour: starting grip and how fast it wears out. */
export const COMPOUND_SPEC: Record<
  TireCompound,
  { startGrip: number; wearRate: number; label: string }
> = {
  SOFT: { startGrip: 100, wearRate: 1.9, label: "Best grip from new, wears out fastest" },
  MEDIUM: { startGrip: 95, wearRate: 1.1, label: "Balanced grip and life" },
  HARD: { startGrip: 90, wearRate: 0.6, label: "Less grip from new, lasts the longest" },
};
