// Fitness / fatigue / form (CTL / ATL / TSB) model. Port of Elevate's FitnessService,
// DayStressModel and DayFitnessTrendModel as plain data + functions.
import dayjs, { type Dayjs } from "dayjs";
import type { Activity, AthleteSnapshot } from "../../lib/types";
import { isRide, isRun, isSwim } from "../../lib/format";

export const FUTURE_DAYS_PREVIEW = 14;
export const DATE_FORMAT = "YYYY-MM-DD";

export type HeartRateImpulseMode = "HRSS" | "TRIMP";

export interface FitnessTrendConfig {
  heartRateImpulseMode: HeartRateImpulseMode;
  initializedFitnessTrendModel: { ctl: number | null; atl: number | null };
  allowEstimatedPowerStressScore: boolean;
  allowEstimatedRunningStressScore: boolean;
  /** YYYY-MM-DD; activities before that day are ignored. */
  ignoreBeforeDate: string | null;
  /** Case-sensitive substrings; activities whose name contains one are ignored. */
  ignoreActivityNamePatterns: string[] | null;
}

export const DEFAULT_CONFIG: FitnessTrendConfig = {
  heartRateImpulseMode: "HRSS",
  initializedFitnessTrendModel: { ctl: null, atl: null },
  allowEstimatedPowerStressScore: true,
  allowEstimatedRunningStressScore: true,
  ignoreBeforeDate: null,
  ignoreActivityNamePatterns: null
};

/** Accepts configs saved by older versions (numeric enum mode, ISO dates) and fills gaps. */
export function normalizeConfig(raw: Partial<FitnessTrendConfig> | null | undefined): FitnessTrendConfig {
  const c = { ...DEFAULT_CONFIG, ...(raw ?? {}) } as FitnessTrendConfig;
  const mode = (raw as any)?.heartRateImpulseMode;
  c.heartRateImpulseMode = mode === "TRIMP" || mode === 1 ? "TRIMP" : "HRSS";
  c.initializedFitnessTrendModel = {
    ctl: numOrNull(raw?.initializedFitnessTrendModel?.ctl),
    atl: numOrNull(raw?.initializedFitnessTrendModel?.atl)
  };
  c.ignoreBeforeDate = c.ignoreBeforeDate ? dayjs(c.ignoreBeforeDate).format(DATE_FORMAT) : null;
  c.ignoreActivityNamePatterns = c.ignoreActivityNamePatterns?.length ? [...c.ignoreActivityNamePatterns] : null;
  return c;
}

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Training zones by form (TSB) threshold: a zone covers values <= its threshold (above the previous one).
export type TrainingZone = "OVERLOAD" | "OPTIMAL" | "NEUTRAL" | "FRESHNESS" | "TRANSITION";
export const TRAINING_ZONE_THRESHOLDS = { OVERLOAD: -30, OPTIMAL: -10, NEUTRAL: 5, FRESHNESS: 25 } as const;

export function findTrainingZone(tsb: number): TrainingZone {
  if (tsb <= TRAINING_ZONE_THRESHOLDS.OVERLOAD) return "OVERLOAD";
  if (tsb <= TRAINING_ZONE_THRESHOLDS.OPTIMAL) return "OPTIMAL";
  if (tsb <= TRAINING_ZONE_THRESHOLDS.NEUTRAL) return "NEUTRAL";
  if (tsb <= TRAINING_ZONE_THRESHOLDS.FRESHNESS) return "FRESHNESS";
  return "TRANSITION";
}

export const trainingZoneName = (z: TrainingZone) => z.charAt(0) + z.slice(1).toLowerCase();

export class FitnessError extends Error {
  constructor(public readonly code: "NO_ACTIVITIES" | "ALL_ACTIVITIES_FILTERED", message: string) {
    super(message);
  }
}

export interface FitnessPreparedActivity {
  id: string;
  date: Date;
  dateString: string;
  type: string;
  name: string;
  hasPowerMeter: boolean;
  athleteSnapshot: AthleteSnapshot;
  heartRateStressScore?: number;
  trainingImpulseScore?: number;
  powerStressScore?: number;
  runningStressScore?: number;
  swimStressScore?: number;
}

export interface DayStress {
  date: Date;
  dateString: string;
  timestamp: number;
  ids: string[];
  types: string[];
  activitiesName: string[];
  athleteSnapshot: AthleteSnapshot | null;
  heartRateStressScore: number | null;
  trainingImpulseScore: number | null;
  powerStressScore: number | null;
  runningStressScore: number | null;
  swimStressScore: number | null;
  finalStressScore: number | null;
  previewDay: boolean;
}

export interface DayFitnessTrend extends DayStress {
  ctl: number;
  atl: number;
  tsb: number;
  prevCtl: number | null;
  prevAtl: number | null;
  prevTsb: number | null;
  trainingZone: TrainingZone;
}

export interface FitnessOptions {
  powerMeterEnable: boolean;
  swimEnable: boolean;
  skipActivityTypes?: string[] | null;
  /** Override "today" (tests). */
  today?: Dayjs;
}

function newDayStress(date: Date, previewDay: boolean): DayStress {
  return {
    date,
    dateString: dayjs(date).format(DATE_FORMAT),
    timestamp: date.getTime(),
    ids: [],
    types: [],
    activitiesName: [],
    athleteSnapshot: null,
    heartRateStressScore: null,
    trainingImpulseScore: null,
    powerStressScore: null,
    runningStressScore: null,
    swimStressScore: null,
    finalStressScore: null,
    previewDay
  };
}

const pos = (v: number | null | undefined): v is number => typeof v === "number" && v > 0;

export function filterActivities(
  activities: Activity[],
  ignoreBeforeDate: string | null,
  ignoreActivityNamePatterns: string[] | null
): Activity[] {
  const before = ignoreBeforeDate ? dayjs(ignoreBeforeDate).format(DATE_FORMAT) : null;
  const patterns = ignoreActivityNamePatterns ?? [];
  if (!before && patterns.length === 0) return activities;
  return activities.filter(a => {
    if (before && dayjs(a.startTime).format(DATE_FORMAT) < before) return false;
    if (patterns.some(p => (a.name ?? "").indexOf(p) !== -1)) return false;
    return true;
  });
}

/** Assign the stress scores eligible for the fitness trend to each activity (oldest first). */
export function prepare(activities: Activity[], config: FitnessTrendConfig, opts: FitnessOptions): FitnessPreparedActivity[] {
  if (activities.length === 0) {
    throw new FitnessError("NO_ACTIVITIES", "No activities available to generate the fitness trend");
  }
  activities = filterActivities(activities, config.ignoreBeforeDate, config.ignoreActivityNamePatterns);
  if (activities.length === 0) {
    throw new FitnessError(
      "ALL_ACTIVITIES_FILTERED",
      "No activities available. They all have been filtered. Unable to generate the fitness trend."
    );
  }

  const sorted = [...activities].sort((a, b) => a.startTimestamp - b.startTimestamp);
  const skip = opts.skipActivityTypes ?? [];
  const trimpMode = config.heartRateImpulseMode === "TRIMP";
  const out: FitnessPreparedActivity[] = [];

  for (const activity of sorted) {
    if (skip.includes(activity.type)) continue;
    const snapshot = activity.athleteSnapshot;
    if (!snapshot) continue; // the backend always snapshots; be forgiving rather than failing the whole trend
    const settings = snapshot.athleteSettings;
    const stress = activity.stats?.scores?.stress;

    const hasHeartRateData =
      (trimpMode && pos(stress?.trimp)) || (config.heartRateImpulseMode === "HRSS" && pos(stress?.hrss));

    const hasPowerData =
      isRide(activity.type, true) &&
      opts.powerMeterEnable &&
      !trimpMode &&
      pos(settings.cyclingFtp) &&
      (activity.hasPowerMeter || config.allowEstimatedPowerStressScore) &&
      pos(stress?.pss);

    const hasRunningData =
      isRun(activity.type) &&
      !trimpMode &&
      pos(settings.runningFtp) &&
      pos(stress?.rss) &&
      config.allowEstimatedRunningStressScore;

    const hasSwimmingData =
      opts.swimEnable && isSwim(activity.type) && !trimpMode && pos(settings.swimFtp) && pos(stress?.sss);

    const start = dayjs(activity.startTime);
    const prepared: FitnessPreparedActivity = {
      id: activity.id,
      date: start.toDate(),
      dateString: start.format(DATE_FORMAT),
      type: activity.type,
      name: activity.name,
      hasPowerMeter: activity.hasPowerMeter,
      athleteSnapshot: snapshot
    };

    if (hasHeartRateData) {
      if (trimpMode) prepared.trainingImpulseScore = stress!.trimp as number;
      else prepared.heartRateStressScore = stress!.hrss as number;
    }
    if (hasPowerData) prepared.powerStressScore = stress!.pss as number;
    if (hasRunningData) prepared.runningStressScore = stress!.rss as number;
    if (hasSwimmingData) prepared.swimStressScore = stress!.sss as number;

    out.push(prepared);
  }
  return out;
}

const add = (a: number | null, b: number) => (a ?? 0) + b;

/** Sum the stress of every activity done on a given day. */
export function dayStressOnDate(day: Dayjs, byDate: Map<string, FitnessPreparedActivity[]>): DayStress {
  const dayActivity = newDayStress(day.toDate(), false);
  for (const activity of byDate.get(day.format(DATE_FORMAT)) ?? []) {
    dayActivity.ids.push(activity.id);
    dayActivity.activitiesName.push(activity.name);
    dayActivity.types.push(activity.type);
    dayActivity.athleteSnapshot = activity.athleteSnapshot;

    if (typeof activity.powerStressScore === "number")
      dayActivity.powerStressScore = add(dayActivity.powerStressScore, activity.powerStressScore);
    if (typeof activity.heartRateStressScore === "number")
      dayActivity.heartRateStressScore = add(dayActivity.heartRateStressScore, activity.heartRateStressScore);
    if (typeof activity.runningStressScore === "number")
      dayActivity.runningStressScore = add(dayActivity.runningStressScore, activity.runningStressScore);
    if (typeof activity.trainingImpulseScore === "number")
      dayActivity.trainingImpulseScore = add(dayActivity.trainingImpulseScore, activity.trainingImpulseScore);
    if (typeof activity.swimStressScore === "number")
      dayActivity.swimStressScore = add(dayActivity.swimStressScore, activity.swimStressScore);

    // Final stress score priorities: PSS w/ power meter > HRSS > TRIMP > estimated PSS > RSS > SSS
    if (activity.powerStressScore && activity.hasPowerMeter) {
      dayActivity.finalStressScore = add(dayActivity.finalStressScore, activity.powerStressScore);
    } else if (activity.heartRateStressScore) {
      dayActivity.finalStressScore = add(dayActivity.finalStressScore, activity.heartRateStressScore);
    } else if (activity.trainingImpulseScore) {
      dayActivity.finalStressScore = add(dayActivity.finalStressScore, activity.trainingImpulseScore);
    } else if (activity.powerStressScore && !activity.hasPowerMeter) {
      dayActivity.finalStressScore = add(dayActivity.finalStressScore, activity.powerStressScore);
    } else if (activity.runningStressScore) {
      dayActivity.finalStressScore = add(dayActivity.finalStressScore, activity.runningStressScore);
    } else if (activity.swimStressScore) {
      dayActivity.finalStressScore = add(dayActivity.finalStressScore, activity.swimStressScore);
    }
  }
  return dayActivity;
}

/** Day by day athlete stress, rest days included, from the day before the first activity to today + preview days. */
export function generateDailyStress(activities: Activity[], config: FitnessTrendConfig, opts: FitnessOptions): DayStress[] {
  const prepared = prepare(activities, config, opts);
  const today = (opts.today ?? dayjs()).startOf("day");
  const daily: DayStress[] = [];
  if (prepared.length === 0) return daily;

  const byDate = new Map<string, FitnessPreparedActivity[]>();
  for (const a of prepared) {
    const list = byDate.get(a.dateString);
    if (list) list.push(a);
    else byDate.set(a.dateString, [a]);
  }

  // Start one day before the first activity so the graph shows the rise.
  let day = dayjs(prepared[0].date).subtract(1, "day").startOf("day");
  while (!day.isAfter(today, "day")) {
    daily.push(dayStressOnDate(day, byDate));
    if (day.isSame(today, "day")) break;
    day = day.add(1, "day");
  }

  for (let i = 0; i < FUTURE_DAYS_PREVIEW; i++) {
    day = day.add(1, "day").startOf("day");
    daily.push(newDayStress(day.toDate(), true));
  }
  return daily;
}

const K_CTL = 1 - Math.exp(-1 / 42);
const K_ATL = 1 - Math.exp(-1 / 7);

/** The fitness trend: CTL (fitness), ATL (fatigue) and TSB (form) for each day. */
export function computeTrend(activities: Activity[], config: FitnessTrendConfig, opts: FitnessOptions): DayFitnessTrend[] {
  const daily = generateDailyStress(activities, config, opts);
  let ctl = 0;
  let atl = 0;
  let tsb = 0;
  let prev: DayFitnessTrend | null = null;
  const trend: DayFitnessTrend[] = [];

  daily.forEach((dayStress, index) => {
    if (index === 0) {
      ctl = config.initializedFitnessTrendModel?.ctl ?? 0;
      atl = config.initializedFitnessTrendModel?.atl ?? 0;
      tsb = ctl - atl;
    } else {
      const stress = dayStress.finalStressScore ?? 0;
      tsb = ctl - atl; // form is yesterday's fitness minus yesterday's fatigue
      ctl = ctl + (stress - ctl) * K_CTL;
      atl = atl + (stress - atl) * K_ATL;
    }

    const day: DayFitnessTrend = {
      ...dayStress,
      ctl,
      atl,
      tsb,
      prevCtl: prev?.ctl || null,
      prevAtl: prev?.atl || null,
      prevTsb: prev?.tsb || null,
      trainingZone: findTrainingZone(tsb)
    };
    prev = day;
    trend.push(day);
  });
  return trend;
}

// --- display helpers (DayFitnessTrendModel print* methods) ---

/** lodash floor with precision. */
export function floorTo(v: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.floor(Number((v * f).toFixed(8))) / f;
}

const roundTo = (v: number, decimals: number) => Math.round(v * 10 ** decimals) / 10 ** decimals;

function printDelta(cur: number, prev: number | null): string | null {
  if (!prev) return null;
  const delta = floorTo(cur, 1) - floorTo(prev, 1);
  return (delta >= 0 ? "+" : "") + roundTo(delta, 1);
}

export const printDeltaFitness = (d: DayFitnessTrend) => printDelta(d.ctl, d.prevCtl);
export const printDeltaFatigue = (d: DayFitnessTrend) => printDelta(d.atl, d.prevAtl);
export const printDeltaForm = (d: DayFitnessTrend) => printDelta(d.tsb, d.prevTsb);

export const printScore = (v: number | null) => (v ? String(Math.round(v)) : "-");

export const hasActivities = (d: DayStress) => d.activitiesName.length > 0;

export function printDate(d: DayStress): string {
  const m = dayjs(d.date);
  const s = m.format("dddd, MMMM D, YYYY");
  return dayjs().startOf("day").isSame(m, "day") ? "Today, " + s : s;
}

/** "3 Rides, 2 Runs & 2 more" */
export function printTypesCount(types: string[], maxTypes?: number, defaultEmpty = ""): string {
  if (types.length === 0) return defaultEmpty;
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  // Stable sort by count desc keeps first-seen order on ties (like lodash orderBy).
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  let result = "";
  for (let index = 0; index < entries.length; index++) {
    const [type, count] = entries[index];
    result += count + " " + type + (count > 1 ? "s" : "");
    if (maxTypes && index === maxTypes - 1) {
      const remaining = entries.length - 1 - index;
      result += remaining > 0 ? " & " + remaining + " more" : "";
      break;
    }
    if (index < entries.length - 1) result += ", ";
  }
  return result;
}

/** The athlete settings the day's stress scores were computed with. */
export function printAthleteSettings(d: DayStress): string | null {
  if (!d.athleteSnapshot) return null;
  const s = d.athleteSnapshot.athleteSettings;
  let out = "";
  if (typeof d.heartRateStressScore === "number" || typeof d.trainingImpulseScore === "number") {
    out += `MaxHr ${s.maxHr}bpm. RestHr ${s.restHr}bpm. `;
    if (s.lthr.default || s.lthr.cycling || s.lthr.running) {
      const parts: string[] = [];
      if (s.lthr.default) parts.push(`D:${s.lthr.default}bpm`);
      if (s.lthr.cycling) parts.push(`C:${s.lthr.cycling}bpm`);
      if (s.lthr.running) parts.push(`R:${s.lthr.running}bpm`);
      out += `Lthr ${parts.join(", ")}. `;
    }
  }
  if (typeof d.powerStressScore === "number" && s.cyclingFtp) out += `Cycling Ftp ${s.cyclingFtp}w. `;
  if (typeof d.runningStressScore === "number" && s.runningFtp) out += `Run Ftp ${s.runningFtp}s/km. `;
  if (typeof d.swimStressScore === "number" && s.swimFtp) out += `Swim Ftp ${s.swimFtp}m/min. `;
  out += `Weight ${s.weight}kg.`;
  return out;
}

/** Ignore-name patterns textarea -> trimmed, unique, non-empty list (or null). */
export function formatPatternsForStorage(input: string): string[] | null {
  const list = [...new Set(input.split(/\r?\n/).map(p => p.trim()).filter(Boolean))];
  return list.length > 0 ? list : null;
}
