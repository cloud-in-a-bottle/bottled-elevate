// Filtering, sorting, CSV export and athlete-settings printing for the activities table.
import dayjs from "dayjs";
import { fmtPace, isNum, isRide, isRun, isSwim } from "../../lib/format";
import type { Activity, MeasureSystem } from "../../lib/types";
import { type Column, headerWithUnit } from "./columns";

export interface Filters {
  name: string;
  sports: string[];
  from: string | null; // YYYY-MM-DD
  to: string | null; // YYYY-MM-DD
}

export type SortDir = "asc" | "desc";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Name search: case-insensitive, words matched in order (original: escaped regex, spaces -> ".*"). */
export function nameMatcher(search: string): (name: string) => boolean {
  const q = search.trim();
  if (!q) return () => true;
  const re = new RegExp(q.split(/\s+/).map(escapeRegExp).join(".*"), "i");
  return name => re.test(name ?? "");
}

export function filterActivities(activities: Activity[], f: Filters): Activity[] {
  const matchName = nameMatcher(f.name);
  const sports = f.sports.length ? new Set(f.sports) : null;
  const from = f.from ? dayjs(f.from).startOf("day").valueOf() : null;
  const to = f.to ? dayjs(f.to).endOf("day").valueOf() : null;
  return activities.filter(a => {
    if (sports && !sports.has(a.type)) return false;
    if (from !== null && dayjs(a.startTime).valueOf() < from) return false;
    if (to !== null && dayjs(a.endTime || a.startTime).valueOf() > to) return false;
    return matchName(a.name);
  });
}

/** Stable sort by a column; missing values always sort last. */
export function sortActivities(activities: Activity[], column: Column | undefined, dir: SortDir): Activity[] {
  if (!column) return activities;
  const sign = dir === "asc" ? 1 : -1;
  const keyed = activities.map((a, i) => ({ a, i, v: column.sortValue(a) }));
  keyed.sort((x, y) => {
    if (x.v === null && y.v === null) return x.i - y.i;
    if (x.v === null) return 1;
    if (y.v === null) return -1;
    const c =
      typeof x.v === "number" && typeof y.v === "number" ? x.v - y.v : String(x.v).localeCompare(String(y.v));
    return c !== 0 ? c * sign : x.i - y.i;
  });
  return keyed.map(k => k.a);
}

/** Sports sorted by how often the athlete practices them (most first). */
export function sportsByCount(activities: Activity[]): { sport: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of activities) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  return [...counts].map(([sport, count]) => ({ sport, count })).sort((a, b) => b.count - a.count || a.sport.localeCompare(b.sport));
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(activities: Activity[], columns: Column[], system: MeasureSystem): string {
  const header = [...columns.map(c => headerWithUnit(c, system)), "Athlete Settings"];
  const rows = activities.map(a => [...columns.map(c => c.csv(a, system)), printAthleteSettings(a, system) ?? ""]);
  return [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\r\n");
}

/** Athlete settings used to compute an activity's stats (ActivitiesComponent.printAthleteSettings). */
export function printAthleteSettings(a: Activity, system: MeasureSystem): string | null {
  const snap = a.athleteSnapshot;
  if (!snap) return null;
  const s = snap.athleteSettings;
  const stress = a.stats?.scores?.stress;
  let out = "";

  if (isNum(stress?.hrss) || isNum(stress?.trimp)) {
    out += `MaxHr ${s.maxHr}bpm. RestHr ${s.restHr}bpm. `;
    if (s.lthr.default || s.lthr.cycling || s.lthr.running) {
      const parts: string[] = [];
      if (s.lthr.default) parts.push(`D:${s.lthr.default}bpm`);
      if (s.lthr.cycling) parts.push(`C:${s.lthr.cycling}bpm`);
      if (s.lthr.running) parts.push(`R:${s.lthr.running}bpm`);
      out += `Lthr ${parts.join(", ")}. `;
    }
  }
  if (isNum(stress?.pss) && s.cyclingFtp) out += `Cycling Ftp ${s.cyclingFtp}w. `;
  if (isNum(stress?.rss) && s.runningFtp) out += `Run Ftp ${fmtPace(s.runningFtp, system)}. `;
  if (a.type === "Swim" && s.swimFtp) out += `Swim Ftp ${s.swimFtp}m/min. `;
  out += `Weight ${s.weight}kg.`;
  return out;
}

/** What to set in athlete settings so the missing stress scores can be computed. */
export function settingsLackHint(a: Activity): string {
  const s = a.athleteSnapshot?.athleteSettings;
  let what = "your functional thresholds";
  if (isRide(a.type, true) && !s?.cyclingFtp) what = "your cycling FTP";
  else if (isRun(a.type) && !s?.runningFtp) what = "your running FTP (threshold pace)";
  else if (isSwim(a.type) && !s?.swimFtp) what = "your swimming FTP";
  return `Some stress scores could not be computed. Set ${what} in Athlete Settings.`;
}

export function compareHref(ids: string[]): string {
  return `/activity/compare/${ids.map(encodeURIComponent).join(",")}`;
}
