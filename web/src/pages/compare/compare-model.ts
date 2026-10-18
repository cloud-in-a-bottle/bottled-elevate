// Compared workouts and the per-stat comparison points (port of activity-compare/shared/*).
import { isNum, militaryToSec } from "../../lib/format";
import type { Activity, MeasureSystem, Streams } from "../../lib/types";
import { secToDateMs } from "../activity/shared/charts";
import type { Stat } from "../activity/shared/stats";

export interface ComparedWorkout {
  activity: Activity;
  streams: Streams | null;
  color: string;
  label: string;
}

export const COMPARE_MAX_WORKOUTS = 8;

// Categorical palette (fixed order, never cycled past 8), stepped per theme surface; validated for
// CVD separation and contrast. Workout identity is also carried by labelled chips and hover labels.
export const COMPARE_PALETTE = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
};

export interface StatChartPoint {
  /** index of the workout in the compared list (workouts are sorted by date) */
  x: number;
  /** numeric value, or epoch-ms-encoded duration when isTime */
  y: number;
  text: string;
  color: string;
  isTime: boolean;
  seconds: number | null;
}

// Matches secToMilitary outputs such as "05:23" or "1:05:23"
const MILITARY_TIME = /^-?\d+(:\d{1,2}){1,2}$/;

/**
 * One point per workout having a value for the stat, converted/formatted like the stat tiles:
 * numeric formats plot as-is while "military time" formats (pace, durations) plot on a time axis.
 */
export function statChartPoints(stat: Stat, workouts: ComparedWorkout[], ms: MeasureSystem): StatChartPoint[] {
  const unit = stat.resolveUnit(ms);
  const out: StatChartPoint[] = [];
  for (const [index, w] of workouts.entries()) {
    const raw = stat.value(w.activity);
    if (!isNum(raw)) continue;
    const display = stat.sensor.formatFromStat(raw * stat.factor, ms, stat.roundDecimals || stat.sensor.defaultRoundDecimals);
    let y: number;
    let isTime = false;
    let seconds: number | null = null;
    if (typeof display === "number" && Number.isFinite(display)) {
      y = display;
    } else if (typeof display === "string" && MILITARY_TIME.test(display)) {
      const neg = display.startsWith("-");
      seconds = militaryToSec(display.replace("-", "")) * (neg ? -1 : 1);
      y = secToDateMs(seconds);
      isTime = true;
    } else continue;
    out.push({
      x: index,
      y,
      text: `${w.label}: ${display}${unit ? " " + unit : ""}`,
      color: w.color,
      isTime,
      seconds
    });
  }
  return out;
}
