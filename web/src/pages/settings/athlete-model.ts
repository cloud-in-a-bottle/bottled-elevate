// Athlete settings logic ported from Elevate's athlete-settings-form, swim-ftp-helper,
// dated-athlete-settings-manager and AthleteService: unit conversions, form parsing/validation,
// dated period bookkeeping and import checks.
import dayjs from "dayjs";
import { KM_TO_MILE_FACTOR, isNum } from "../../lib/format";
import type { AthleteSettings, DatedAthleteSettings, MeasureSystem, Num } from "../../lib/types";

/** Default LTHR when none is set: 85% of heart rate reserve (Karvonen), FitnessService constant. */
export const DEFAULT_LTHR_KARVONEN_HRR_FACTOR = 0.85;

export const karvonenLthr = (maxHr: number, restHr: number) => restHr + DEFAULT_LTHR_KARVONEN_HRR_FACTOR * (maxHr - restHr);

export const DEFAULT_ATHLETE_SETTINGS: AthleteSettings = {
  maxHr: 190,
  restHr: 65,
  lthr: { default: null, cycling: null, running: null },
  cyclingFtp: null,
  runningFtp: null,
  swimFtp: null,
  weight: 70
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:MM:SS" (always 3 parts) of a seconds count. */
function hhmmss(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  return `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** "M:SS" or "H:MM:SS" (pace display/inputs). */
export function minSec(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Parse "ss", "m:ss" or "h:mm:ss" to seconds; null if malformed. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(:[0-5]?\d){0,2}$/.test(t)) return null;
  return t.split(":").reduce((acc, part) => acc * 60 + parseInt(part, 10), 0);
}

// --- swimming (SwimFtpHelperComponent) ---

/** Swim speed (m/min) -> pace "HH:MM:SS" per 100m. */
export function convertSwimSpeedToPace(swimFtp: Num): string {
  if (!isNum(swimFtp)) return "";
  return hhmmss(Math.round((1 / (swimFtp / 60)) * 100));
}

/** Pace per 100m ("HH:MM:SS", "MM:SS") -> swim speed (m/min), 2 decimals. */
export function convertPaceToSwimSpeed(pace: string): number {
  const totalSeconds = parseDuration(pace) ?? NaN;
  return parseFloat(((60 * 100) / totalSeconds).toFixed(2));
}

export interface SwimCalculationMethod {
  name: string;
  params: string[]; // hints
  formula: (params: number[]) => number;
}

export const SWIM_CALCULATION_METHODS: SwimCalculationMethod[] = [
  {
    name: "60 minutes swimming FTP test (recommended)",
    params: ["Swim as far as possible during 60 minutes: distance performed in meters (e.g. 1800)"],
    formula: p => p[0] / 60
  },
  {
    name: "30 minutes swimming FTP test",
    params: ["Swim as far as possible during 30 minutes: distance performed in meters (e.g. 950)"],
    formula: p => p[0] / 30 - ((2 * p[0]) / 30) * 0.025
  },
  {
    name: "Critical velocity test: 200m test, rest, then 400m test",
    params: [
      "Swim 200 meters as fast as possible: time in seconds (e.g. 210)",
      "After a rest (same session), swim 400 meters as fast as possible: time in seconds (e.g. 590)"
    ],
    formula: p => (400 - 200) / ((p[1] - p[0]) / 60)
  }
];

/** Run a swim calculation method; null when the result is not a positive number. */
export function computeSwimFtp(method: SwimCalculationMethod, params: number[]): number | null {
  const v = method.formula(params);
  return Number.isFinite(v) && v > 0 ? parseFloat(v.toFixed(3)) : null;
}

// --- running threshold pace ---

/** Running FTP (s/km) as pace text in the given system ("4:30"), or "" when unset. */
export function runningFtpToPace(runningFtp: Num, system: MeasureSystem): string {
  if (!isNum(runningFtp) || runningFtp <= 0) return "";
  return minSec(system === "imperial" ? runningFtp / KM_TO_MILE_FACTOR : runningFtp);
}

/** Pace text per km/mi -> s/km. null if empty, NaN if malformed. */
export function paceToRunningFtp(pace: string, system: MeasureSystem): number | null {
  if (!pace.trim()) return null;
  const s = parseDuration(pace);
  if (s === null || s <= 0) return NaN;
  return Math.round((system === "imperial" ? s * KM_TO_MILE_FACTOR : s) * 10) / 10;
}

// --- form ---

export interface SettingsDraft {
  since: string | null;
  weight: string;
  maxHr: string;
  restHr: string;
  lthrDefault: string;
  lthrCycling: string;
  lthrRunning: string;
  cyclingFtp: string;
  runningPace: string; // per km or mi
  swimFtp: string; // m/min
}

const str = (v: Num) => (isNum(v) ? String(v) : "");

export function toDraft(s: DatedAthleteSettings, system: MeasureSystem): SettingsDraft {
  return {
    since: s.since,
    weight: str(s.weight),
    maxHr: str(s.maxHr),
    restHr: str(s.restHr),
    lthrDefault: str(s.lthr?.default ?? null),
    lthrCycling: str(s.lthr?.cycling ?? null),
    lthrRunning: str(s.lthr?.running ?? null),
    cyclingFtp: str(s.cyclingFtp),
    runningPace: runningFtpToPace(s.runningFtp, system),
    swimFtp: str(s.swimFtp)
  };
}

export type DraftErrors = Partial<Record<keyof SettingsDraft, string>>;

/**
 * Parse and validate a draft (rules of the original form + AthleteService.validateSingle, matching the
 * server's checks). `otherSinces` are the since dates of the other periods, to reject duplicates.
 */
export function fromDraft(
  d: SettingsDraft,
  system: MeasureSystem,
  otherSinces: (string | null)[]
): { settings: DatedAthleteSettings | null; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const num = (key: keyof SettingsDraft, required: boolean): Num => {
    const text = String(d[key] ?? "").trim();
    if (!text) {
      if (required) errors[key] = "Required";
      return null;
    }
    const v = Number(text);
    if (!Number.isFinite(v) || v <= 0) {
      errors[key] = "Must be a positive number";
      return null;
    }
    return v;
  };

  const weight = num("weight", true);
  const maxHr = num("maxHr", true);
  const restHr = num("restHr", true);
  if (isNum(maxHr) && isNum(restHr) && maxHr <= restHr) {
    errors.maxHr = "Max HR should be higher than rest HR";
    errors.restHr = "Rest HR should be lower than max HR";
  }
  const lthr = { default: num("lthrDefault", false), cycling: num("lthrCycling", false), running: num("lthrRunning", false) };
  const cyclingFtp = num("cyclingFtp", false);
  const runningFtp = paceToRunningFtp(d.runningPace, system);
  if (Number.isNaN(runningFtp)) errors.runningPace = "Enter a pace like 4:30";
  const swimFtp = num("swimFtp", false);

  if (d.since !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.since) || !dayjs(d.since).isValid()) errors.since = "Enter a valid date";
    else if (otherSinces.includes(d.since)) errors.since = "A period already starts on this date";
  }

  if (Object.keys(errors).length > 0) return { settings: null, errors };
  return {
    settings: {
      since: d.since,
      weight: weight!,
      maxHr: maxHr!,
      restHr: restHr!,
      lthr,
      cyclingFtp,
      runningFtp: Number.isNaN(runningFtp) ? null : runningFtp,
      swimFtp
    },
    errors
  };
}

// --- dated periods ---

/** Newest period first, "forever" (since = null) last, like AthleteService.fetch. */
export function sortPeriods(periods: DatedAthleteSettings[]): DatedAthleteSettings[] {
  return [...periods].sort((a, b) => {
    if (a.since === b.since) return 0;
    if (a.since === null) return 1;
    if (b.since === null) return -1;
    return a.since < b.since ? 1 : -1;
  });
}

/** "Until" date of each sorted period (DatedAthleteSettingsTable): the day before the next newer period. */
export function periodUntil(sorted: DatedAthleteSettings[], index: number): string | null {
  const newer = sorted[index - 1];
  return newer && newer.since ? dayjs(newer.since).subtract(1, "day").format("YYYY-MM-DD") : null;
}

export const today = () => dayjs().format("YYYY-MM-DD");

/** Set-level checks (AthleteService.validate): one forever period, no duplicate dates. */
export function periodsError(periods: DatedAthleteSettings[]): string | null {
  const counts = new Map<string | null, number>();
  for (const p of periods) counts.set(p.since, (counts.get(p.since) ?? 0) + 1);
  if (!counts.has(null)) return "Default forever dated athlete settings must exist.";
  if ([...counts.values()].some(c => c > 1)) return "Dated athlete settings have duplicates.";
  return null;
}

const nullableNumber = (v: unknown) => v === null || typeof v === "number";

/**
 * Parse an imported dated settings export: JSON, or the base64-encoded JSON of the original app.
 * Port of assertSettingsValid + validate. Returns the periods or throws with a message.
 */
export function parseDatedSettingsImport(text: string): DatedAthleteSettings[] {
  const raw = text.trim();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    try {
      data = JSON.parse(atob(raw));
    } catch {
      throw new Error("Data provided is corrupted");
    }
  }
  if (!Array.isArray(data)) throw new Error("Invalid dated athlete settings set.");
  const out = data.map((s: any) => {
    if (!s || typeof s !== "object") throw new Error("Invalid dated athlete settings set.");
    if (s.since !== null && typeof s.since !== "string") throw new Error("Invalid since date detected");
    if (typeof s.since === "string" && !/^\d{4}-\d{2}-\d{2}/.test(s.since)) throw new Error("Invalid since date detected");
    if (!s.weight) throw new Error("Invalid weight detected");
    if (!s.maxHr) throw new Error("Invalid maxHr detected");
    if (!s.restHr) throw new Error("Invalid restHr detected");
    if (!s.lthr) throw new Error("Missing LTHR property detected");
    if (!nullableNumber(s.lthr.default)) throw new Error("Missing LTHR default detected");
    if (!nullableNumber(s.lthr.cycling)) throw new Error("Missing LTHR cycling detected");
    if (!nullableNumber(s.lthr.running)) throw new Error("Missing LTHR running detected");
    if (!nullableNumber(s.cyclingFtp)) throw new Error("Missing cycling FTP detected");
    if (!nullableNumber(s.runningFtp)) throw new Error("Missing running FTP detected");
    if (!nullableNumber(s.swimFtp)) throw new Error("Missing swim FTP detected");
    const settings: DatedAthleteSettings = {
      since: s.since === null ? null : s.since.slice(0, 10),
      weight: s.weight,
      maxHr: s.maxHr,
      restHr: s.restHr,
      lthr: { default: s.lthr.default, cycling: s.lthr.cycling, running: s.lthr.running },
      cyclingFtp: s.cyclingFtp,
      runningFtp: s.runningFtp,
      swimFtp: s.swimFtp
    };
    return settings;
  });
  const err = periodsError(out);
  if (err) throw new Error(err);
  return sortPeriods(out);
}

/** Age in whole years at a date (default today). */
export function ageAt(birthDate: string | null, at = dayjs()): number | null {
  if (!birthDate || !dayjs(birthDate).isValid()) return null;
  return at.diff(dayjs(birthDate), "year");
}
