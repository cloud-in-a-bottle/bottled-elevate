// Activity table column definitions (port of appcore ActivityColumns namespace).
// Each number column keeps the original units / precision / factor / imperial factor.
import dayjs from "dayjs";
import {
  fmtSwimPace,
  getPath,
  isNum,
  isRide,
  isRun,
  isSwim,
  KM_TO_MILE_FACTOR,
  METER_TO_FEET_FACTOR,
  round,
  secToMilitary,
  sportName
} from "../../lib/format";
import type { Activity, MeasureSystem } from "../../lib/types";

export const NO_DATA = "-";

export type ColumnKind = "date" | "text" | "link" | "number";
type SystemUnits = { metric: string; imperial: string };
type Units = string | SystemUnits | "cadence" | null;
type NumberPrint = "number" | "pace" | "time";

export const Category = {
  COMMON: "Common",
  SPEED: "Speed",
  PACE: "Pace",
  ELEVATION: "Elevation",
  HEART_RATE: "Heart rate",
  CADENCE: "Cadence",
  POWER: "Power",
  GRADE: "Grade",
  OTHERS: "Others"
} as const;

export interface Column {
  id: string;
  header: string;
  category: string;
  kind: ColumnKind;
  description?: string;
  isDefault: boolean;
  /** Text shown in the table cell. */
  display(a: Activity, system: MeasureSystem): string;
  /** Raw value used for sorting (null sorts last). */
  sortValue(a: Activity): number | string | null;
  /** Value written to the CSV export. */
  csv(a: Activity, system: MeasureSystem): string | number;
  /** Unit label for the CSV header, if any. */
  csvUnit(system: MeasureSystem): string | null;
}

const LONG_DISTANCE: SystemUnits = { metric: "km", imperial: "mi" };
const LONG_PACE: SystemUnits = { metric: "/km", imperial: "/mi" };
const SHORT_DISTANCE: SystemUnits = { metric: "m", imperial: "ft" };
const ELEVATION: SystemUnits = { metric: "m", imperial: "ft" };
const VERTICAL_ASCENT: SystemUnits = { metric: "vm/h", imperial: "vft/h" };
const SPEED: SystemUnits = { metric: "kph", imperial: "mph" };
const GRADE = "%";

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function resolveUnits(units: Units, a: Activity | null, system: MeasureSystem): string | null {
  if (!units) return null;
  if (units === "cadence") {
    if (!a) return "rpm or spm";
    if (isRun(a.type)) return "spm";
    if (isSwim(a.type)) return "spm";
    if (isRide(a.type, true)) return "rpm";
    return "rpm";
  }
  if (typeof units === "string") return units;
  return system === "imperial" ? units.imperial : units.metric;
}

/** Value at path, scaled by factor (and imperial factor), rounded to precision (Print.getConvertValueAtPath). */
export function convertedValue(
  a: Activity,
  path: string,
  system: MeasureSystem,
  precision: number | null = 0,
  factor = 1,
  imperialFactor = 1
): number | null {
  const raw = getPath(a, path);
  if (!isNum(raw)) return null;
  let v = raw * factor;
  if (system === "imperial") v *= imperialFactor;
  return precision === null ? v : round(v, precision);
}

interface NumberOpts {
  units?: Units;
  print?: NumberPrint;
  precision?: number | null;
  factor?: number;
  imperialFactor?: number;
  description?: string;
  isDefault?: boolean;
}

function num(category: string, path: string, header: string | null, opts: NumberOpts = {}): Column {
  const print = opts.print ?? "number";
  const precision = opts.precision === undefined ? (print === "pace" ? null : 0) : opts.precision;
  const factor = opts.factor ?? 1;
  const imperialFactor = opts.imperialFactor ?? 1;
  const units: Units = opts.units ?? null;
  const value = (a: Activity, s: MeasureSystem) => convertedValue(a, path, s, precision, factor, imperialFactor);
  const isPacePath = path.startsWith("stats.pace.");
  return {
    id: path,
    header: header ?? upperFirst(path.split(".").pop()!),
    category,
    kind: "number",
    description: opts.description,
    isDefault: !!opts.isDefault,
    display(a, s) {
      // Swim paces read better per 100m/100yd than per km/mi.
      if (print === "pace" && isPacePath && isSwim(a.type)) return fmtSwimPace(getPath(a, path) as number, s);
      const v = value(a, s);
      if (v === null) return NO_DATA;
      if (print === "time") return secToMilitary(v);
      const u = resolveUnits(units, a, s);
      if (print === "pace") return secToMilitary(v) + (u ? " " + u : "");
      return u ? `${v} ${u}` : `${v}`;
    },
    sortValue(a) {
      const raw = getPath(a, path);
      return isNum(raw) ? raw : null;
    },
    csv(a, s) {
      const v = value(a, s);
      if (v === null) return "";
      return print === "number" ? v : secToMilitary(v);
    },
    csvUnit: s => (print === "time" ? null : resolveUnits(units, null, s))
  };
}

function text(category: string, path: string, header: string, print: "field" | "boolean" | "sport" = "field"): Column {
  const show = (a: Activity): string => {
    const v = getPath(a, path);
    if (print === "boolean") return v ? "Yes" : "No";
    if (v === null || v === undefined || v === "") return NO_DATA;
    return print === "sport" ? sportName(String(v)) : String(v);
  };
  return {
    id: path,
    header,
    category,
    kind: "text",
    isDefault: false,
    display: show,
    sortValue: a => {
      const v = getPath(a, path);
      if (print === "boolean") return v ? 1 : 0;
      return v === null || v === undefined || v === "" ? null : String(v).toLowerCase();
    },
    csv: show,
    csvUnit: () => null
  };
}

function date(category: string, path: string, header: string): Column {
  return {
    id: path,
    header,
    category,
    kind: "date",
    isDefault: false,
    display: a => {
      const v = getPath(a, path);
      return v ? dayjs(v as string).format("ddd, MMM DD, YYYY") : NO_DATA;
    },
    sortValue: a => {
      const v = getPath(a, path);
      return v ? dayjs(v as string).valueOf() : null;
    },
    csv: a => {
      const v = getPath(a, path);
      return v ? dayjs(v as string).toISOString() : "";
    },
    csvUnit: () => null
  };
}

const withDefault = (c: Column): Column => ({ ...c, isDefault: true });

const KM = { units: LONG_DISTANCE, precision: 1, factor: 0.001, imperialFactor: KM_TO_MILE_FACTOR };
const KPH = { units: SPEED, precision: 1, factor: 1, imperialFactor: KM_TO_MILE_FACTOR };
const PACE = { units: LONG_PACE, print: "pace" as const, imperialFactor: 1 / KM_TO_MILE_FACTOR };
const ELEV = { units: ELEVATION, precision: 0, factor: 1, imperialFactor: METER_TO_FEET_FACTOR };
const C = Category;

export const ALL_COLUMNS: Column[] = [
  // Common
  withDefault(date(C.COMMON, "startTime", "Date")),
  withDefault({ ...text(C.COMMON, "name", "Name"), kind: "link" }),
  withDefault(text(C.COMMON, "type", "Type", "sport")),
  num(C.COMMON, "stats.movingTime", "Moving Time", { print: "time", isDefault: true }),
  num(C.COMMON, "stats.elapsedTime", "Total Time", { print: "time" }),
  num(C.COMMON, "stats.distance", "Distance", { ...KM, isDefault: true }),
  num(C.COMMON, "stats.elevationGain", "Elevation Gain", { ...ELEV, precision: 1, isDefault: true }),
  num(C.COMMON, "stats.speed.avg", "Avg Speed", { ...KPH, isDefault: true }),
  num(C.COMMON, "stats.pace.avg", "Avg Pace", { ...PACE, isDefault: true }),
  num(C.COMMON, "stats.scores.runningRating", "Running Rating", {
    precision: 1,
    description: '"Running Rating" is an equivalent of "Running Index" from Polar'
  }),
  num(C.COMMON, "stats.scores.efficiency", "Efficiency Factor", {
    precision: 2,
    description:
      'Efficiency Factor (EF) is your "Normalized Power® (Input)/ Average Heart rate (Output)". Higher value means better aerobic fit.'
  }),
  num(C.COMMON, "stats.scores.powerHr", "Power/Hr", {
    precision: 2,
    description: "Avg power over avg heart rate. A higher value means you produced more power for a given heart rate."
  }),
  num(C.COMMON, "stats.calories", "Calories"),
  num(C.COMMON, "stats.caloriesPerHour", "Calories / Hour"),
  num(C.COMMON, "stats.moveRatio", "Move Ratio", { precision: 2 }),
  num(C.COMMON, "stats.grade.slopeTime.up", "Climbing Time", { print: "time" }),
  num(C.COMMON, "stats.grade.slopeTime.flat", "Flat Time", { print: "time" }),
  num(C.COMMON, "stats.grade.slopeTime.down", "Downhill Time", { print: "time" }),
  num(C.COMMON, "stats.grade.slopeDistance.up", "Climbing Distance", KM),
  num(C.COMMON, "stats.grade.slopeDistance.flat", "Flat Distance", KM),
  num(C.COMMON, "stats.grade.slopeDistance.down", "Downhill Distance", KM),

  // Speed
  num(C.SPEED, "stats.speed.max", "Max Speed", KPH),
  num(C.SPEED, "stats.speed.best20min", "Best 20min Speed", KPH),
  num(C.SPEED, "stats.grade.slopeSpeed.up", "Climbing Speed", KPH),
  num(C.SPEED, "stats.grade.slopeSpeed.flat", "Flat Speed", KPH),
  num(C.SPEED, "stats.grade.slopeSpeed.down", "Downhill Speed", KPH),
  num(C.SPEED, "stats.speed.lowQ", "25% Speed", KPH),
  num(C.SPEED, "stats.speed.median", "50% Speed", KPH),
  num(C.SPEED, "stats.speed.upperQ", "75% Speed", KPH),
  num(C.SPEED, "stats.speed.stdDev", "σ Speed", { ...KPH, description: "Standard Deviation Speed" }),

  // Pace
  num(C.PACE, "stats.pace.gapAvg", "Grade Adj. Pace", { ...PACE, description: "Grade Adjusted Pace" }),
  num(C.PACE, "stats.pace.best20min", "Best 20min Pace", PACE),
  num(C.PACE, "stats.pace.lowQ", "25% Pace", PACE),
  num(C.PACE, "stats.pace.median", "50% Pace", PACE),
  num(C.PACE, "stats.pace.upperQ", "75% Pace", PACE),
  num(C.PACE, "stats.scores.stress.rss", "Running Stress Score", { isDefault: true }),
  num(C.PACE, "stats.scores.stress.rssPerHour", "Running Stress Score / h"),
  num(C.PACE, "stats.scores.stress.sss", "Swimming Stress Score"),
  num(C.PACE, "stats.scores.stress.sssPerHour", "Swimming Stress Score / h"),
  num(C.PACE, "stats.scores.swolf.25", "SWOLF 25m", { description: "Swimming efficiency (strokes + seconds) per 25m length" }),
  num(C.PACE, "stats.scores.swolf.50", "SWOLF 50m", { description: "Swimming efficiency (strokes + seconds) per 50m length" }),

  // Heart rate
  num(C.HEART_RATE, "stats.heartRate.avg", "Avg HR", { units: "bpm", isDefault: true }),
  num(C.HEART_RATE, "stats.heartRate.max", "Max HR", { units: "bpm" }),
  num(C.HEART_RATE, "stats.heartRate.avgReserve", "Avg HRR", { units: "%", description: "Average Heart Rate Reserve" }),
  num(C.HEART_RATE, "stats.heartRate.maxReserve", "Max HRR", { units: "%", description: "Max Heart Rate Reserve" }),
  num(C.HEART_RATE, "stats.scores.stress.hrss", "HRSS", { description: "Heart Rate Stress Score", isDefault: true }),
  num(C.HEART_RATE, "stats.scores.stress.hrssPerHour", "HRSS / h", { description: "Heart Rate Stress Score / h" }),
  num(C.HEART_RATE, "stats.scores.stress.trimp", "TRIMP", { description: "Training Impulse Score" }),
  num(C.HEART_RATE, "stats.scores.stress.trimpPerHour", "TRIMP / h", { description: "Training Impulse Score / h" }),
  num(C.HEART_RATE, "stats.heartRate.best20min", "Best 20min HR", { units: "bpm" }),
  num(C.HEART_RATE, "stats.heartRate.best60min", "Best 60min HR", { units: "bpm" }),
  num(C.HEART_RATE, "stats.heartRate.lowQ", "25% HR", { units: "bpm", description: "Lower Quartile Bpm" }),
  num(C.HEART_RATE, "stats.heartRate.median", "50% HR", { units: "bpm", description: "Median Bpm" }),
  num(C.HEART_RATE, "stats.heartRate.upperQ", "75% HR", { units: "bpm", description: "Upper Quartile Bpm" }),
  num(C.HEART_RATE, "stats.heartRate.stdDev", "σ HR", { units: "bpm", description: "Standard Deviation Bpm" }),

  // Cadence
  num(C.CADENCE, "stats.cadence.avgActive", "Avg Active Cadence", {
    units: "cadence",
    description: "Average cadence when active",
    isDefault: true
  }),
  num(C.CADENCE, "stats.cadence.avg", "Avg Cadence", { units: "cadence", description: "Cadence Average inc. pause time" }),
  num(C.CADENCE, "stats.cadence.activeRatio", "Active Cadence Ratio", { precision: 2, description: "Active cadence ratio" }),
  num(C.CADENCE, "stats.cadence.max", "Max Cadence", { units: "cadence" }),
  num(C.CADENCE, "stats.cadence.activeTime", "Active Cadence Time", { print: "time", description: "Active cadence time" }),
  num(C.CADENCE, "stats.cadence.stdDev", "σ Cadence", { units: "cadence", description: "Standard Deviation Cadence" }),
  num(C.CADENCE, "stats.cadence.cycles", "Cadence Count", {
    description: "Total Crank Revolutions for cycling and Steps for running"
  }),
  num(C.CADENCE, "stats.cadence.lowQ", "25% Cadence", { units: "cadence" }),
  num(C.CADENCE, "stats.cadence.median", "50% Cadence", { units: "cadence" }),
  num(C.CADENCE, "stats.cadence.upperQ", "75% Cadence", { units: "cadence" }),
  num(C.CADENCE, "stats.grade.slopeCadence.up", "Avg Climbing Cadence", { units: "cadence" }),
  num(C.CADENCE, "stats.grade.slopeCadence.flat", "Avg Flat Cadence", { units: "cadence" }),
  num(C.CADENCE, "stats.grade.slopeCadence.down", "Avg Downhill Cadence", { units: "cadence" }),
  num(C.CADENCE, "stats.cadence.distPerCycle", "Distance / Revolution", {
    units: SHORT_DISTANCE,
    precision: 2,
    imperialFactor: METER_TO_FEET_FACTOR
  }),

  // Power
  text(C.POWER, "hasPowerMeter", "Power Meter", "boolean"),
  num(C.POWER, "stats.power.avg", "Avg Watts", { units: "w", isDefault: true }),
  num(C.POWER, "stats.power.avgKg", "Avg W / Kg", { units: "w/kg", precision: 2, description: "Avg Watts / Kilograms" }),
  num(C.POWER, "stats.power.weighted", "Normalized Power®", { units: "w" }),
  num(C.POWER, "stats.power.weightedKg", "NP® / Kg", { units: "w/kg", precision: 2, description: "Normalized Power® / Kilograms" }),
  num(C.POWER, "stats.power.max", "Max Power", { units: "w" }),
  num(C.POWER, "stats.power.best20min", "Best 20min Power", { units: "w" }),
  num(C.POWER, "stats.power.variabilityIndex", "Variability Index", { precision: 2 }),
  num(C.POWER, "stats.power.intensityFactor", "Intensity Factor®", { precision: 2 }),
  num(C.POWER, "stats.power.work", "Work", { units: "kJ" }),
  num(C.POWER, "stats.scores.stress.pss", "Power Stress Score", { isDefault: true }),
  num(C.POWER, "stats.scores.stress.pssPerHour", "Power Stress Score / h"),
  num(C.POWER, "stats.power.stdDev", "σ Power", { units: "w", description: "Standard Deviation Power" }),
  num(C.POWER, "stats.power.lowQ", "25% Watts", { units: "w", description: "Lower Quartile Watts" }),
  num(C.POWER, "stats.power.median", "50% Watts", { units: "w", description: "Median Watts" }),
  num(C.POWER, "stats.power.upperQ", "75% Watts", { units: "w", description: "Upper Quartile Watts" }),

  // Elevation
  num(C.ELEVATION, "stats.elevation.avg", "Avg Elevation", ELEV),
  num(C.ELEVATION, "stats.elevation.descent", "Elevation Descent", ELEV),
  num(C.ELEVATION, "stats.elevation.lowQ", "25% Elevation", { ...ELEV, description: "Lower Quartile Elevation" }),
  num(C.ELEVATION, "stats.elevation.median", "50% Elevation", { ...ELEV, description: "Median Elevation" }),
  num(C.ELEVATION, "stats.elevation.upperQ", "75% Elevation", { ...ELEV, description: "Upper Quartile Elevation" }),
  num(C.ELEVATION, "stats.elevation.ascentSpeed", "Avg Ascent Speed", { ...ELEV, units: VERTICAL_ASCENT }),

  // Grade
  num(C.GRADE, "stats.grade.avg", "Avg Grade", { units: GRADE, precision: 1 }),
  num(C.GRADE, "stats.grade.min", "Min Grade", { units: GRADE, precision: 1 }),
  num(C.GRADE, "stats.grade.max", "Max Grade", { units: GRADE, precision: 1 }),
  text(C.GRADE, "stats.grade.slopeProfile", "Slope Profile"),
  num(C.GRADE, "stats.grade.lowQ", "25% Grade", { units: GRADE, precision: 1 }),
  num(C.GRADE, "stats.grade.median", "50% Grade", { units: GRADE, precision: 1 }),
  num(C.GRADE, "stats.grade.upperQ", "75% Grade", { units: GRADE }),
  num(C.GRADE, "stats.grade.stdDev", "Standard Deviation Grade", { units: GRADE }),

  // Others
  text(C.OTHERS, "trainer", "Indoor", "boolean"),
  text(C.OTHERS, "commute", "Commute", "boolean"),
  text(C.OTHERS, "isSwimPool", "Swim Pool", "boolean"),
  text(C.OTHERS, "device", "Device"),
  text(C.OTHERS, "source", "Source"),
  date(C.OTHERS, "creationTime", "Created Time"),
  date(C.OTHERS, "lastEditTime", "Last Edited Time"),
  text(C.OTHERS, "id", "Identifier"),
  text(C.OTHERS, "hash", "Hash")
];

export const COLUMNS_BY_ID = new Map(ALL_COLUMNS.map(c => [c.id, c]));
export const DEFAULT_COLUMN_IDS = ALL_COLUMNS.filter(c => c.isDefault).map(c => c.id);
/** The columns kept by "un-tick all". */
export const MINIMAL_COLUMN_IDS = ["startTime", "name", "type"];

export function columnCategories(): { label: string; columns: Column[] }[] {
  const groups = new Map<string, Column[]>();
  for (const c of ALL_COLUMNS) {
    if (!groups.has(c.category)) groups.set(c.category, []);
    groups.get(c.category)!.push(c);
  }
  return [...groups].map(([label, columns]) => ({ label, columns }));
}

/** Restore saved column ids (unknown ids dropped; definition order kept), or the defaults. */
export function resolveColumns(saved: string[] | null): Column[] {
  if (!saved || !Array.isArray(saved)) return ALL_COLUMNS.filter(c => c.isDefault);
  const set = new Set(saved);
  const cols = ALL_COLUMNS.filter(c => set.has(c.id));
  return cols.length ? cols : ALL_COLUMNS.filter(c => c.isDefault);
}

/** Header label including units, as in the CSV export. */
export function headerWithUnit(c: Column, system: MeasureSystem): string {
  const u = c.csvUnit(system);
  return u ? `${c.header} (${u})` : c.header;
}
