// Unit conversions and display formatting shared by every page.
import dayjs from "dayjs";
import type { MeasureSystem, Num } from "./types";

export const MPS_KPH_FACTOR = 3.6;
export const SEC_HOUR_FACTOR = 3600;
export const KM_TO_MILE_FACTOR = 0.621371;
export const METER_TO_FEET_FACTOR = 3.28084;
export const METER_TO_YARD_FACTOR = 1.09361;

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** lodash-style round (half up). */
export function round(v: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Seconds to HH:MM:SS, dropping a leading "00:" hour (Elevate's Time.secToMilitary). */
export function secToMilitary(totalSeconds: number, trimZeros = false): string {
  const s = Math.round(totalSeconds);
  const parts = [Math.floor(s / 3600), Math.floor(s / 60) % 60, Math.round(s % 60)];
  const out = parts
    .map(v => (v < 10 ? "0" + v : String(v)))
    .filter((v, i) => v !== "00" || i > 0)
    .join(":");
  return trimZeros && out[0] === "0" ? out.slice(1) : out;
}

/** HH:MM:SS (or MM:SS) to seconds. */
export function militaryToSec(hhMmSs: string): number {
  const p = hhMmSs.split(":");
  let s = 0;
  let m = 1;
  while (p.length > 0) {
    s += m * parseInt(p.pop() as string, 10);
    m *= 60;
  }
  return s;
}

export const speedToPace = (kph: Num): Num => (isNum(kph) && kph > 0 ? SEC_HOUR_FACTOR / kph : null);
export const paceToSpeed = (pace: Num): Num => (isNum(pace) && pace > 0 ? SEC_HOUR_FACTOR / pace : null);

const DASH = "-";

/** Duration in seconds as H:MM:SS. */
export function fmtDuration(seconds: Num): string {
  return isNum(seconds) ? secToMilitary(seconds) : DASH;
}

/** Meters as km/mi. */
export function fmtDistance(meters: Num, system: MeasureSystem, decimals = 1): string {
  if (!isNum(meters)) return DASH;
  const km = meters / 1000;
  return system === "imperial" ? `${round(km * KM_TO_MILE_FACTOR, decimals)} mi` : `${round(km, decimals)} km`;
}

/** Meters as m/ft (elevation). */
export function fmtElevation(meters: Num, system: MeasureSystem): string {
  if (!isNum(meters)) return DASH;
  return system === "imperial" ? `${Math.round(meters * METER_TO_FEET_FACTOR)} ft` : `${Math.round(meters)} m`;
}

/** kph as kph/mph. */
export function fmtSpeed(kph: Num, system: MeasureSystem, decimals = 1): string {
  if (!isNum(kph)) return DASH;
  return system === "imperial" ? `${round(kph * KM_TO_MILE_FACTOR, decimals)} mph` : `${round(kph, decimals)} kph`;
}

/** s/km as m:ss /km or /mi. */
export function fmtPace(secondsPerKm: Num, system: MeasureSystem): string {
  if (!isNum(secondsPerKm) || secondsPerKm <= 0) return DASH;
  return system === "imperial"
    ? `${secToMilitary(secondsPerKm / KM_TO_MILE_FACTOR, true)} /mi`
    : `${secToMilitary(secondsPerKm, true)} /km`;
}

/** s/km as m:ss per 100m / 100yd (swimming). */
export function fmtSwimPace(secondsPerKm: Num, system: MeasureSystem): string {
  if (!isNum(secondsPerKm) || secondsPerKm <= 0) return DASH;
  const per100m = secondsPerKm / 10;
  // 100yd is shorter than 100m, so it takes less time.
  return system === "imperial"
    ? `${secToMilitary(per100m / METER_TO_YARD_FACTOR, true)} /100yd`
    : `${secToMilitary(per100m, true)} /100m`;
}

export function fmtNumber(v: Num, decimals = 0, unit = ""): string {
  if (!isNum(v)) return DASH;
  return `${round(v, decimals)}${unit ? " " + unit : ""}`;
}

export const distanceUnit = (s: MeasureSystem) => (s === "imperial" ? "mi" : "km");
export const elevationUnit = (s: MeasureSystem) => (s === "imperial" ? "ft" : "m");
export const speedUnit = (s: MeasureSystem) => (s === "imperial" ? "mph" : "kph");
export const paceUnit = (s: MeasureSystem) => (s === "imperial" ? "/mi" : "/km");

/** Meters to the user's distance unit (km or mi). */
export const toDistanceUnit = (meters: number, s: MeasureSystem) =>
  s === "imperial" ? (meters / 1000) * KM_TO_MILE_FACTOR : meters / 1000;

/** Meters to the user's elevation unit (m or ft). */
export const toElevationUnit = (meters: number, s: MeasureSystem) => (s === "imperial" ? meters * METER_TO_FEET_FACTOR : meters);

export const fmtDate = (iso: string, format = "ddd, MMM D, YYYY") => dayjs(iso).format(format);
export const fmtDateTime = (iso: string) => dayjs(iso).format("dddd, MMMM D, YYYY h:mm A");

/** "WeightTraining" -> "Weight Training". */
export const sportName = (sport: string) => sport.replace(/([a-z])([A-Z])/g, "$1 $2");

export const isRide = (sport: string, allowElectric = false) =>
  sport === "Ride" || sport === "VirtualRide" || (allowElectric && sport === "EBikeRide");
export const isRun = (sport: string) => sport === "Run" || sport === "VirtualRun";
export const isWalkHike = (sport: string) => sport === "Walk" || sport === "Hike";
export const isByFoot = (sport: string) => isRun(sport) || isWalkHike(sport);
export const isSwim = (sport: string) => sport === "Swim";
export const isPaced = (sport: string) => isByFoot(sport) || isSwim(sport);

export const SPORTS = [
  "AlpineSki", "AmericanFootball", "Aquathlon", "BackcountrySki", "Badminton", "Baseball", "Basketball", "Boxing",
  "Canoeing", "Cardio", "Climbing", "Combat", "Cricket", "Crossfit", "Dance", "Diving", "Drive", "Duathlon",
  "EBikeRide", "Elliptical", "ESkateboard", "EUnicycle", "Fishing", "Flying", "Football", "Frisbee", "Golf",
  "Gymnastics", "Handcycle", "Handball", "HangGliding", "Hike", "HorsebackRiding", "IceHockey", "IceSkate",
  "InlineSkate", "Kayaking", "Kitesurf", "Manual", "MotorSports", "Mountaineering", "NordicSki", "Orienteering",
  "Other", "Paragliding", "Pickleball", "Ride", "RockClimbing", "RollerSki", "Rowing", "Rugby", "Run", "Sailing",
  "Skateboard", "SkiTouring", "SkyDiving", "Snorkeling", "Snowboard", "Snowmobiling", "Snowshoe", "Softball",
  "Squash", "StairStepper", "StandUpPaddling", "Stretching", "Surfing", "Swim", "TableTennis", "Tactical",
  "TelemarkSki", "Tennis", "TrackAndField", "Triathlon", "Velomobile", "VirtualRide", "VirtualRun", "Volleyball",
  "Wakeboarding", "Walk", "WaterSkiing", "WeightTraining", "Wheelchair", "Windsurf", "Workout", "Yoga"
];

/** Read a dotted path ("stats.heartRate.avg") off an object. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[key];
  }
  return cur;
}
