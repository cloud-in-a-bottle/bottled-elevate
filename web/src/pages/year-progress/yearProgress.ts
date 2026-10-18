// Port of Elevate's YearProgressService (+ the delta logic of YearProgressTableComponent): per-day cumulative
// "year to date" and "rolling window" sums of distance / time / elevation / count, target lines and deltas.
import dayjs from "dayjs";
import { KM_TO_MILE_FACTOR, METER_TO_FEET_FACTOR } from "../../lib/format";
import {
  Delta,
  DeltaType,
  ProgressAtDayModel,
  ProgressActivityInput,
  ProgressConfig,
  ProgressMode,
  ProgressModel,
  ProgressPreset,
  ProgressType,
  ProgressionAtDayRow,
  TargetProgressModel,
  YearProgressModel,
  YearProgressTypeModel
} from "./models";

export const ERROR_NO_ACTIVITY_MODELS = "Empty activity";
export const ERROR_NO_TYPES_FILTER = "Empty types filter";
export const ERROR_NO_YEAR_PROGRESS_MODELS = "Empty YearProgressModels from given activity types";

// --- calendar helpers (local time, like moment) ---

export const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
export const daysInYear = (year: number) => (isLeapYear(year) ? 366 : 365);

export function dayOfYear(date: Date): number {
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 864e5) + 1;
}

/** Same calendar day in another year; Feb 29 becomes Feb 28 in non leap years (moment's `.year(y)`). */
export function atYear(date: Date, year: number): Date {
  const month = date.getMonth();
  const day = Math.min(date.getDate(), new Date(year, month + 1, 0).getDate());
  return new Date(year, month, day);
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Rolling window length in days, like `moment.duration(multiplier, period).asDays()`. */
export function findRollingDays(rollingPeriod: string, periodMultiplier: number): number {
  const monthsToDays = (months: number) => Math.round((months * 146097) / 4800);
  switch (rollingPeriod.toLowerCase()) {
    case "days":
      return periodMultiplier;
    case "weeks":
      return periodMultiplier * 7;
    case "months":
      return monthsToDays(periodMultiplier);
    case "years":
      return monthsToDays(periodMultiplier * 12);
    default:
      throw new Error("Unknown rolling period: " + rollingPeriod);
  }
}

export function provideProgressTypes(isMetric: boolean): YearProgressTypeModel[] {
  return [
    { type: ProgressType.DISTANCE, label: "Distance", unit: isMetric ? "kilometers" : "miles", shortUnit: isMetric ? "km" : "mi" },
    { type: ProgressType.TIME, label: "Time", unit: "hours", shortUnit: "h" },
    { type: ProgressType.ELEVATION, label: "Elevation", unit: isMetric ? "meters" : "feet", shortUnit: isMetric ? "m" : "ft" },
    { type: ProgressType.COUNT, label: "Count" }
  ];
}

export function valueOf(progress: ProgressModel, type: ProgressType): number {
  switch (type) {
    case ProgressType.DISTANCE:
      return progress.distance;
    case ProgressType.TIME:
      return progress.time;
    case ProgressType.ELEVATION:
      return progress.elevation;
    case ProgressType.COUNT:
      return progress.count;
    default:
      throw new Error("Unknown progress type: " + type);
  }
}

interface YearProgressActivity {
  year: number;
  dayOfYear: number;
  commute: boolean;
  trainer: boolean;
  distance: number;
  movingTime: number;
  elevationGain: number;
}

const dayKey = (year: number, doy: number) => year * 1000 + doy;

/** Activities of the given types, grouped by day. */
function groupFilteredActivities(activities: ProgressActivityInput[], typesFilter: string[]): Map<number, YearProgressActivity[]> {
  const types = new Set(typesFilter);
  const byDay = new Map<number, YearProgressActivity[]>();
  for (const activity of activities) {
    if (!types.has(activity.type)) continue;
    const start = new Date(activity.startTime);
    const item: YearProgressActivity = {
      year: start.getFullYear(),
      dayOfYear: dayOfYear(start),
      commute: !!activity.commute,
      trainer: !!activity.trainer,
      distance: activity.stats?.distance || 0,
      movingTime: activity.stats?.movingTime || 0,
      elevationGain: activity.stats?.elevationGain || 0
    };
    const key = dayKey(item.year, item.dayOfYear);
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
  }
  return byDay;
}

function isExcluded(config: ProgressConfig, activity: YearProgressActivity): boolean {
  return (!config.includeCommuteRide && activity.commute) || (!config.includeIndoorRide && activity.trainer);
}

/** Iterates every day from Jan 1st of `fromYear` to Dec 31st of `toYear`. */
function* eachDay(fromYear: number, toYear: number): Generator<[number, number]> {
  for (let year = fromYear; year <= toYear; year++) {
    const n = daysInYear(year);
    for (let doy = 1; doy <= n; doy++) yield [year, doy];
  }
}

/**
 * Per-day progressions of every year from the first activity's year to the current one (current year runs to
 * Dec 31st, days after `today` flagged isFuture). Values are prepared for display: km|mi, hours, m|ft, count.
 */
export function progressions(
  config: ProgressConfig,
  isMetric: boolean,
  activities: ProgressActivityInput[],
  today: Date = new Date()
): YearProgressModel[] {
  if (!activities || activities.length === 0) throw new Error(ERROR_NO_ACTIVITY_MODELS);
  if (!config.activityTypes || config.activityTypes.length === 0) throw new Error(ERROR_NO_TYPES_FILTER);

  const byDay = groupFilteredActivities(activities, config.activityTypes);
  if (byDay.size === 0) throw new Error(ERROR_NO_YEAR_PROGRESS_MODELS);

  // From 1st january of the first activity's year (any type) to the end of the current year
  let firstTime = Infinity;
  for (const a of activities) firstTime = Math.min(firstTime, new Date(a.startTime).getTime());
  const fromYear = new Date(firstTime).getFullYear();
  const toYear = today.getFullYear();
  const todayKey = dayKey(today.getFullYear(), dayOfYear(today));

  return config.mode === ProgressMode.ROLLING
    ? computeRollingSumProgressions(config, isMetric, fromYear, toYear, todayKey, byDay)
    : computeYearToDateSumProgressions(config, isMetric, fromYear, toYear, todayKey, byDay);
}

function computeYearToDateSumProgressions(
  config: ProgressConfig,
  isMetric: boolean,
  fromYear: number,
  toYear: number,
  todayKey: number,
  byDay: Map<number, YearProgressActivity[]>
): YearProgressModel[] {
  const yearProgressions: YearProgressModel[] = [];
  let current: YearProgressModel | null = null;
  let last = { distance: 0, time: 0, elevation: 0, count: 0 };

  for (const [year, doy] of eachDay(fromYear, toYear)) {
    if (!current || current.year !== year) {
      current = { mode: config.mode, year, progressions: [] };
      yearProgressions.push(current);
      last = { distance: 0, time: 0, elevation: 0, count: 0 }; // New year: start totals from 0
    }
    const totals = { ...last };
    for (const activity of byDay.get(dayKey(year, doy)) ?? []) {
      if (isExcluded(config, activity)) continue;
      totals.distance += activity.distance;
      totals.time += activity.movingTime;
      totals.elevation += activity.elevationGain;
      totals.count++;
    }
    last = totals;
    current.progressions.push(
      prepareAlongSystemUnits({ year, dayOfYear: doy, ...totals, isFuture: dayKey(year, doy) > todayKey }, isMetric)
    );
  }
  return yearProgressions;
}

function computeRollingSumProgressions(
  config: ProgressConfig,
  isMetric: boolean,
  fromYear: number,
  toYear: number,
  todayKey: number,
  byDay: Map<number, YearProgressActivity[]>
): YearProgressModel[] {
  const rollingDays = config.rollingDays ?? 1;
  const yearProgressions: YearProgressModel[] = [];
  let current: YearProgressModel | null = null;

  let isRollingBufferSizeReached = false;
  let rollingBufferSize = 0;
  const buffers = { distance: [] as number[], time: [] as number[], elevation: [] as number[], count: [] as number[] };
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  for (const [year, doy] of eachDay(fromYear, toYear)) {
    // Increase buffer size until rolling days length is reached
    if (!isRollingBufferSizeReached) {
      if (rollingBufferSize === rollingDays) isRollingBufferSizeReached = true;
      else rollingBufferSize++;
    }

    const onDay = { distance: 0, time: 0, elevation: 0, count: 0 };
    for (const activity of byDay.get(dayKey(year, doy)) ?? []) {
      if (isExcluded(config, activity)) continue;
      onDay.distance += activity.distance;
      onDay.time += activity.movingTime;
      onDay.elevation += activity.elevationGain;
      onDay.count++;
    }

    buffers.distance.push(onDay.distance);
    buffers.time.push(onDay.time);
    buffers.elevation.push(onDay.elevation);
    buffers.count.push(onDay.count);

    const drop = (values: number[]) => (isRollingBufferSizeReached ? (values.shift() as number) : 0);
    const rolling = {
      distance: sum(buffers.distance) - drop(buffers.distance),
      time: sum(buffers.time) - drop(buffers.time),
      elevation: sum(buffers.elevation) - drop(buffers.elevation),
      count: sum(buffers.count) - drop(buffers.count)
    };

    if (!current || current.year !== year) {
      current = { mode: config.mode, year, progressions: [] };
      yearProgressions.push(current);
    }
    current.progressions.push(
      prepareAlongSystemUnits({ year, dayOfYear: doy, ...rolling, isFuture: dayKey(year, doy) > todayKey }, isMetric)
    );
  }
  return yearProgressions;
}

/** Raw meters/seconds to rounded km|mi, rounded m|ft and (unrounded) hours. */
export function prepareAlongSystemUnits(progression: ProgressModel, isMetric: boolean): ProgressModel {
  let distance = progression.distance / 1000;
  if (!isMetric) distance *= KM_TO_MILE_FACTOR;
  let elevation = progression.elevation;
  if (!isMetric) elevation *= METER_TO_FEET_FACTOR;
  return {
    ...progression,
    distance: Math.round(distance),
    elevation: Math.round(elevation),
    time: progression.time / 3600
  };
}

export function yearToDateTargetProgression(year: number, targetValue: number): TargetProgressModel[] {
  const n = daysInYear(year);
  const step = targetValue / n;
  const out: TargetProgressModel[] = [];
  let value = step;
  for (let day = 1; day <= n; day++) {
    out.push({ dayOfYear: day, value });
    value += step;
  }
  return out;
}

export function rollingTargetProgression(year: number, targetValue: number): TargetProgressModel[] {
  const out: TargetProgressModel[] = [];
  for (let day = 1; day <= daysInYear(year); day++) out.push({ dayOfYear: day, value: targetValue });
  return out;
}

/** Years from the first activity to the current one, newest first. */
export function availableYears(activities: ProgressActivityInput[], today: Date = new Date()): number[] {
  if (activities.length === 0) return [];
  let first = Infinity;
  for (const a of activities) first = Math.min(first, new Date(a.startTime).getTime());
  const years: number[] = [];
  for (let y = today.getFullYear(); y >= new Date(first).getFullYear(); y--) years.push(y);
  return years;
}

/** The value of each selected year on the same calendar day as `day`. */
export function findProgressionsAtDay(
  yearProgressions: YearProgressModel[],
  day: Date,
  progressType: ProgressType,
  selectedYears: number[],
  yearsColorsMap: Map<number, string> | null
): ProgressAtDayModel[] {
  const out: ProgressAtDayModel[] = [];
  for (const selectedYear of selectedYears) {
    const yearProgress = yearProgressions.find(p => p.year === selectedYear);
    if (!yearProgress) continue;
    const date = startOfDay(atYear(day, selectedYear));
    const progress = yearProgress.progressions[dayOfYear(date) - 1];
    if (progress) {
      out.push({
        date,
        year: selectedYear,
        progressType,
        value: valueOf(progress, progressType),
        color: yearsColorsMap ? yearsColorsMap.get(selectedYear) ?? null : null
      });
    }
  }
  return out;
}

/** Hours to "12h, 30m" (sign dropped). */
export function readableTimeProgress(hoursIn: number): string {
  if (!hoursIn) return "0h";
  const totalMinutes = Math.round(Math.abs(hoursIn) * 60 * 1e6) / 1e6; // absorb float noise like moment.duration
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  const showHours = hours ? `${hours}h` + (minutes ? ", " : "") : "";
  const showMinutes = minutes ? `${minutes}m` : "";
  return `${showHours}${showMinutes}`;
}

// --- table deltas ---

export const DELTA_SIGN_POSITIVE = "+";
export const DELTA_SIGN_NEGATIVE = "-";
export const DELTA_SIGN_UNSIGNED = "";

function deltaSign(deltaValue: number | null, nan = false): { type: DeltaType; sign: string | null } {
  if (deltaValue === null || nan) return { type: DeltaType.NAN, sign: null };
  if (deltaValue === 0) return { type: DeltaType.UNSIGNED, sign: DELTA_SIGN_UNSIGNED };
  if (deltaValue < 0) return { type: DeltaType.NEGATIVE, sign: DELTA_SIGN_NEGATIVE };
  return { type: DeltaType.POSITIVE, sign: DELTA_SIGN_POSITIVE };
}

const fmtDeltaDate = (d: Date) => dayjs(d).format("MMMM DD, YYYY");

export function getDeltaValueBetween(a: ProgressAtDayModel, b: ProgressAtDayModel | undefined | null): Delta {
  const isSameYearComparison = !!(a && b && a.year === b.year);
  const bValue = b && typeof b.value === "number" ? b.value : null;
  const deltaValue = bValue !== null ? a.value - bValue : null;
  const { type, sign } = deltaSign(deltaValue, isSameYearComparison);
  return {
    type,
    date: b ? fmtDeltaDate(b.date) : null,
    value: deltaValue !== null ? Math.abs(deltaValue) : null,
    signSymbol: sign,
    class: type
  };
}

/** `isWatchedDayFuture`: the watched day is after today and the row is the current year. */
export function getDeltaFromTarget(progressAtDay: ProgressAtDayModel, target: TargetProgressModel, isWatchedDayFuture: boolean): Delta {
  const deltaValue = typeof target.value === "number" ? Math.floor(progressAtDay.value - target.value) : null;
  const { type, sign } = deltaSign(deltaValue);
  return {
    type,
    date: fmtDeltaDate(progressAtDay.date),
    value: deltaValue !== null ? Math.abs(deltaValue) : null,
    signSymbol: sign,
    class: isWatchedDayFuture ? DeltaType.NAN : type
  };
}

/**
 * Table rows: one per selected year (in the given order), each compared with the next row (previous year),
 * with the current year's value on the same day and with the target of that day.
 */
export function progressionRows(
  progressAtDayModels: ProgressAtDayModel[],
  currentYearProgressAtDay: ProgressAtDayModel | undefined,
  targetProgressModel: TargetProgressModel | null | undefined,
  progressType: YearProgressTypeModel,
  isWatchedDayFuture: (year: number) => boolean = () => false
): ProgressionAtDayRow[] {
  return progressAtDayModels.map((model, index) => ({
    year: model.year,
    color: model.color,
    progressTypeLabel: progressType.label,
    progressTypeUnit: progressType.shortUnit ?? "",
    currentValue: model.value,
    deltaPreviousYear: getDeltaValueBetween(model, progressAtDayModels[index + 1]),
    deltaCurrentYear: getDeltaValueBetween(model, currentYearProgressAtDay),
    deltaTarget: targetProgressModel ? getDeltaFromTarget(model, targetProgressModel, isWatchedDayFuture(model.year)) : null
  }));
}

// --- presets ---

const sameTypes = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** Whether a preset with the same attributes (and target) already exists. */
export function findSamePreset(presets: ProgressPreset[], preset: ProgressPreset): ProgressPreset | undefined {
  return presets.find(
    p =>
      p.mode === preset.mode &&
      p.progressType === preset.progressType &&
      sameTypes(p.activityTypes ?? [], preset.activityTypes) &&
      !!p.includeCommuteRide === !!preset.includeCommuteRide &&
      !!p.includeIndoorRide === !!preset.includeIndoorRide &&
      (p.targetValue ?? null) === (preset.targetValue ?? null) &&
      (preset.mode !== ProgressMode.ROLLING ||
        (p.rollingPeriod === preset.rollingPeriod && p.periodMultiplier === preset.periodMultiplier))
  );
}

export function newPresetId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Normalizes a target value input: only positive numbers count. */
export const cleanTarget = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
