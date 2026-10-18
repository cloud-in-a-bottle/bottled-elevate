// Viewed period presets and navigation (slide / zoom) for the fitness trend graph.
import dayjs, { type Dayjs } from "dayjs";
import { DATE_FORMAT, FUTURE_DAYS_PREVIEW, type DayFitnessTrend } from "./fitness";

/** Dates are YYYY-MM-DD strings (local days); key is set when the period comes from a preset. */
export interface Period {
  from: string;
  to: string;
  key: string | null;
}

export interface LastPeriod extends Period {
  key: string;
  label: string;
}

export const DEFAULT_LAST_PERIOD_KEY = "3_months";
export const SLIDE_DAYS = 14;
export const ZOOM_DAYS = 14;

const PRESETS: [string, string, number, dayjs.ManipulateType][] = [
  ["7_days", "7 days", 7, "day"],
  ["14_days", "14 days", 14, "day"],
  ["month", "30 days", 1, "month"],
  ["6_weeks", "6 weeks", 6, "week"],
  ["2_months", "2 months", 2, "month"],
  ["3_months", "3 months", 3, "month"],
  ["4_months", "4 months", 4, "month"],
  ["5_months", "5 months", 5, "month"],
  ["6_months", "6 months", 6, "month"],
  ["7_months", "7 months", 7, "month"],
  ["8_months", "8 months", 8, "month"],
  ["9_months", "9 months", 9, "month"],
  ["12_months", "12 months", 1, "year"],
  ["18_months", "18 months", 18, "month"],
  ["24_months", "24 months", 2, "year"],
  ["36_months", "36 months", 3, "year"],
  ["48_months", "48 months", 4, "year"]
];

const fmt = (d: Dayjs) => d.format(DATE_FORMAT);

export function lastPeriods(minDate: string, now: Dayjs = dayjs()): LastPeriod[] {
  const today = now.startOf("day");
  const to = fmt(today.add(FUTURE_DAYS_PREVIEW, "day"));
  return [
    ...PRESETS.map(([key, label, n, unit]) => ({ key, label, from: fmt(today.subtract(n, unit)), to })),
    { key: "beginning", label: "Since beginning", from: minDate, to }
  ];
}

const shift = (date: string, days: number) => fmt(dayjs(date).add(days, "day"));

export const canForward = (p: Period, dateMax: string) => shift(p.to, SLIDE_DAYS) <= dateMax;
export const canBackward = (p: Period, dateMin: string) => shift(p.from, -SLIDE_DAYS) >= dateMin;
export const canZoomIn = (p: Period) => shift(p.from, ZOOM_DAYS) < p.to;
export const canZoomOut = (p: Period, dateMin: string) => shift(p.from, -ZOOM_DAYS) >= dateMin;

export const forward = (p: Period): Period => ({ from: shift(p.from, SLIDE_DAYS), to: shift(p.to, SLIDE_DAYS), key: null });
export const backward = (p: Period): Period => ({ from: shift(p.from, -SLIDE_DAYS), to: shift(p.to, -SLIDE_DAYS), key: null });
export const zoomIn = (p: Period): Period => ({ ...p, from: shift(p.from, ZOOM_DAYS), key: null });
export const zoomOut = (p: Period): Period => ({ ...p, from: shift(p.from, -ZOOM_DAYS), key: null });

/** Inclusive start/end indexes of the trend days covered by a period (clamped to the trend). */
export function indexesOf(trend: DayFitnessTrend[], p: Period): { start: number; end: number } {
  let start = trend.findIndex(d => d.dateString >= p.from);
  if (start === -1) start = 0;
  let end = -1;
  for (let i = trend.length - 1; i >= 0; i--) {
    if (trend[i].dateString <= p.to) {
      end = i;
      break;
    }
  }
  if (end === -1) end = trend.length - 1;
  if (start > end) start = end;
  return { start, end };
}
