// Zone definitions and editing rules, ported from Elevate's zone-definitions.ts, ZonesService and
// UserZonesModel. Zones are stored on the server as a flat list of boundaries ([0, 10, 20] = two zones);
// the editor works on {from, to} pairs and keeps neighbouring zones contiguous.
import { KM_TO_MILE_FACTOR } from "../../lib/format";
import type { UserZones, ZoneType } from "../../lib/types";

export interface ZoneRange {
  from: number;
  to: number;
}

export interface ZoneDefinition {
  name: string;
  value: ZoneType;
  group: string;
  units: string;
  step: number;
  min: number;
  max: number;
  /** Extra read-only rendering of a value (e.g. pace as mm:ss). */
  customDisplay?: (v: number) => string;
}

export const MIN_ZONES_COUNT = 3;
export const MAX_ZONES_COUNT = 40;

const fmtMinSec = (seconds: number) => {
  const s = Math.round(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const ZONE_DEFINITIONS: ZoneDefinition[] = [
  { name: "Heart Rate", value: "heartRate", group: "Heart rate", units: "BPM", step: 1, min: 0, max: 9999 },
  {
    name: "Cycling Speed",
    value: "speed",
    group: "Cycling",
    units: "KPH",
    step: 0.1,
    min: 0,
    max: 9999,
    customDisplay: kph => (kph * KM_TO_MILE_FACTOR).toFixed(1) + " mph"
  },
  { name: "Cycling Power", value: "power", group: "Cycling", units: "Watts", step: 1, min: 0, max: 9999 },
  { name: "Cycling Cadence", value: "cyclingCadence", group: "Cycling", units: "RPM", step: 1, min: 0, max: 9999 },
  {
    name: "Running Pace",
    value: "pace",
    group: "Running",
    units: "Seconds",
    step: 1,
    min: 0,
    max: 3599,
    customDisplay: s => `${fmtMinSec(s)}/km | ${fmtMinSec(s / KM_TO_MILE_FACTOR)}/mi`
  },
  { name: "Running Power", value: "runningPower", group: "Running", units: "Watts", step: 1, min: 0, max: 9999 },
  { name: "Running Cadence", value: "runningCadence", group: "Running", units: "SPM", step: 0.1, min: 0, max: 9999 },
  { name: "Grade", value: "grade", group: "Terrain", units: "%", step: 0.1, min: -9999, max: 9999 },
  { name: "Elevation", value: "elevation", group: "Terrain", units: "m", step: 5, min: 0, max: 9999 },
  { name: "Ascent speed", value: "ascent", group: "Terrain", units: "Vm/h", step: 5, min: 0, max: 9999 }
];

export const DEFAULT_ZONE_TYPE: ZoneType = "heartRate";

export const zoneDefinition = (type: string | undefined): ZoneDefinition | undefined =>
  ZONE_DEFINITIONS.find(d => d.value === type);

export const DEFAULT_ZONES: UserZones = {
  speed: [0, 10, 15, 20, 25, 27, 30, 32, 34, 36, 38, 40, 42, 44, 47, 50, 60, 75],
  pace: [60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420, 450, 480, 540, 570, 720, 900],
  heartRate: [95, 114, 133, 152, 171, 190, 209],
  power: [0, 50, 100, 150, 175, 200, 225, 250, 300, 325, 350, 375, 400, 425, 450, 475, 500, 600, 800, 1500],
  runningPower: [0, 50, 100, 150, 175, 200, 225, 250, 300, 325, 350, 375, 400, 425, 450, 475, 500, 600, 800, 1500],
  cyclingCadence: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 125, 150],
  runningCadence: [65, 67, 69, 71, 73, 75, 77, 79, 81, 83, 85, 87, 89, 91, 93, 95, 97, 99, 101, 103, 105, 107, 109, 111, 115, 120],
  grade: [-20, -17, -14, -12, -9, -6, -3, -2, -1, -0.5, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 25],
  elevation: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000],
  ascent: [
    0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000,
    3200, 3400, 3600, 3800, 4000, 4200, 4400, 4600, 4800, 5000, 6000
  ]
};

const isNumber = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

/** Boundaries -> zones (UserZonesModel.deserialize). */
export function deserializeZones(boundaries: number[]): ZoneRange[] {
  const zones: ZoneRange[] = [];
  boundaries.forEach((b, i) => {
    if (!isNumber(b)) throw new Error("Cannot deserialize zones because of corrupted zones. Try to reset them to default.");
    if (isNumber(boundaries[i + 1])) zones.push({ from: b, to: boundaries[i + 1] });
  });
  return zones;
}

/** Zones -> boundaries (UserZonesModel.serialize). */
export function serializeZones(zones: ZoneRange[]): number[] {
  const out: number[] = [];
  zones.forEach((z, i) => {
    if (!z.from && !z.to) throw new Error("Cannot serialize zones");
    if (zones[i - 1]) {
      if (zones[i - 1].to !== z.from) out.push(z.from);
      out.push(z.to);
    } else {
      out.push(z.from, z.to);
    }
  });
  return out;
}

/**
 * Validation (ZonesService.isZonesCompliant): zone count limits and contiguity. Additionally checks
 * every bound is a number inside the definition range and zones go upward, which the original only
 * enforced through input min/max attributes. Returns an error message, or null when valid.
 */
export function zonesError(zones: ZoneRange[] | null | undefined, def?: ZoneDefinition): string | null {
  const NOT_COMPLIANT = "Not compliant zones provided: pattern is not respected.";
  if (!zones || !Array.isArray(zones)) return "No zones provided";
  if (zones.length > MAX_ZONES_COUNT) return `Not compliant zones provided: expected at max ${MAX_ZONES_COUNT} zones`;
  if (zones.length < MIN_ZONES_COUNT) return `Not compliant zones provided: expected at least ${MIN_ZONES_COUNT} zones`;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z || !isNumber(z.from) || !isNumber(z.to)) return `Zone ${i + 1} has an invalid value`;
    if (i < zones.length - 1 && z.to !== zones[i + 1].from) return NOT_COMPLIANT;
    if (i > 0 && z.from !== zones[i - 1].to) return NOT_COMPLIANT;
    if (z.from >= z.to) return `Zone ${i + 1}: "from" must be lower than "to"`;
    if (def && (z.from < def.min || z.to > def.max)) return `Zone ${i + 1}: values must be between ${def.min} and ${def.max}`;
  }
  return null;
}

export type EditResult = { zones: ZoneRange[]; message: string } | { error: string };

/** Split the last zone in two at its middle (ZonesService.addLastZone). */
export function addLastZone(zones: ZoneRange[]): EditResult {
  if (zones.length >= MAX_ZONES_COUNT) return { error: `You can't add more than ${MAX_ZONES_COUNT} zones...` };
  const next = zones.map(z => ({ ...z }));
  const last = next[next.length - 1];
  const middle = Math.floor((last.from + last.to) / 2);
  next.push({ from: middle, to: last.to });
  last.to = middle;
  return { zones: next, message: `Zone ${next.length} has been added.` };
}

export function removeLastZone(zones: ZoneRange[]): EditResult {
  if (zones.length <= MIN_ZONES_COUNT) return { error: `You can't remove more than ${MIN_ZONES_COUNT} zones...` };
  return { zones: zones.slice(0, -1).map(z => ({ ...z })), message: `Zone ${zones.length} has been removed.` };
}

/** Remove one zone; a middle zone's range is absorbed by the next zone (ZonesService.removeZoneAtIndex). */
export function removeZoneAt(zones: ZoneRange[], index: number): EditResult {
  if (zones.length <= MIN_ZONES_COUNT) return { error: `You can't remove more than ${MIN_ZONES_COUNT} zones...` };
  const next = zones.map(z => ({ ...z }));
  if (index > 0 && index < next.length - 1) next[index + 1].from = next[index - 1].to;
  next.splice(index, 1);
  return { zones: next, message: `Zone ${index + 1} has been removed.` };
}

/**
 * Set one bound of a zone and propagate it to the neighbour sharing that boundary, so zones stay
 * contiguous (ZonesService.whisperZoneChange + ZoneComponent.applyChangeOrder).
 */
export function setZoneBound(zones: ZoneRange[], index: number, field: "from" | "to", value: number): ZoneRange[] {
  const next = zones.map(z => ({ ...z }));
  next[index][field] = value;
  if (field === "from" && index > 0) next[index - 1].to = value;
  if (field === "to" && index < next.length - 1) next[index + 1].from = value;
  return next;
}

/**
 * Parse an import: a JSON list of {from, to} zones (the original export format) or a plain list of
 * boundaries. Returns the zones, or an error message.
 */
export function parseZonesImport(text: string, def?: ZoneDefinition): ZoneRange[] | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "Provided zones do not respect expected format";
  }
  if (!Array.isArray(parsed)) return "Provided zones do not respect expected format";
  let zones: ZoneRange[];
  if (parsed.every(v => typeof v === "number")) {
    zones = deserializeZones(parsed as number[]);
  } else if (parsed.every(v => v && typeof v === "object" && "from" in v && "to" in v)) {
    zones = (parsed as ZoneRange[]).map(z => ({ from: Number(z.from), to: Number(z.to) }));
  } else {
    return "Provided zones do not respect expected format";
  }
  return zonesError(zones, def) ?? zones;
}
