import { describe, expect, it } from "vitest";
import {
  computeSwimFtp,
  convertPaceToSwimSpeed,
  convertSwimSpeedToPace,
  fromDraft,
  paceToRunningFtp,
  parseDatedSettingsImport,
  periodUntil,
  runningFtpToPace,
  sortPeriods,
  SWIM_CALCULATION_METHODS,
  toDraft,
  DEFAULT_ATHLETE_SETTINGS
} from "./athlete-model";
import type { DatedAthleteSettings } from "../../lib/types";

describe("swim FTP helper", () => {
  it("converts swim speed to pace", () => {
    expect(convertSwimSpeedToPace(1)).toBe("01:40:00");
    expect(convertSwimSpeedToPace(31)).toBe("00:03:14");
    expect(convertSwimSpeedToPace(500)).toBe("00:00:12");
    expect(convertSwimSpeedToPace(57)).toBe("00:01:45");
    expect(convertSwimSpeedToPace(null)).toBe("");
  });
  it("converts pace to swim speed", () => {
    expect(convertPaceToSwimSpeed("00:03:14")).toBe(30.93);
    expect(convertPaceToSwimSpeed("00:00:12")).toBe(500);
    expect(convertPaceToSwimSpeed("1:45")).toBe(57.14);
  });
  it("computes the calculator methods", () => {
    const [m60, m30, cv] = SWIM_CALCULATION_METHODS;
    expect(computeSwimFtp(m60, [1800])).toBe(30);
    expect(computeSwimFtp(m30, [950])).toBeCloseTo(950 / 30 - ((2 * 950) / 30) * 0.025, 3);
    expect(computeSwimFtp(cv, [210, 590])).toBeCloseTo(31.579, 3);
    expect(computeSwimFtp(cv, [590, 210])).toBeNull();
    expect(computeSwimFtp(m60, [NaN])).toBeNull();
  });
});

describe("running threshold pace", () => {
  it("formats and parses per km and mi", () => {
    expect(runningFtpToPace(270, "metric")).toBe("4:30");
    expect(runningFtpToPace(270, "imperial")).toBe("7:15");
    expect(paceToRunningFtp("4:30", "metric")).toBe(270);
    expect(paceToRunningFtp("7:15", "imperial")).toBeCloseTo(270.3, 1);
    expect(paceToRunningFtp("", "metric")).toBeNull();
    expect(paceToRunningFtp("abc", "metric")).toBeNaN();
  });
});

const period = (since: string | null, extra: Partial<DatedAthleteSettings> = {}): DatedAthleteSettings => ({
  ...DEFAULT_ATHLETE_SETTINGS,
  lthr: { ...DEFAULT_ATHLETE_SETTINGS.lthr },
  since,
  ...extra
});

describe("form draft", () => {
  it("round-trips settings", () => {
    const s = period("2024-01-01", { cyclingFtp: 250, runningFtp: 270, swimFtp: 31, lthr: { default: 170, cycling: null, running: 175 } });
    const r = fromDraft(toDraft(s, "metric"), "metric", []);
    expect(r.errors).toEqual({});
    expect(r.settings).toEqual(s);
  });
  it("validates HR order, required fields, dates and duplicates", () => {
    const d = toDraft(period("2024-01-01"), "metric");
    expect(fromDraft({ ...d, maxHr: "60" }, "metric", []).errors.maxHr).toMatch(/higher/);
    expect(fromDraft({ ...d, weight: "" }, "metric", []).errors.weight).toBe("Required");
    expect(fromDraft({ ...d, cyclingFtp: "-3" }, "metric", []).errors.cyclingFtp).toBeDefined();
    expect(fromDraft({ ...d, since: "2024-13-45x" }, "metric", []).errors.since).toBeDefined();
    expect(fromDraft(d, "metric", ["2024-01-01"]).errors.since).toMatch(/already/);
  });
});

describe("dated periods", () => {
  it("sorts newest first with forever last and computes until dates", () => {
    const sorted = sortPeriods([period(null), period("2023-05-01"), period("2024-02-10")]);
    expect(sorted.map(p => p.since)).toEqual(["2024-02-10", "2023-05-01", null]);
    expect(periodUntil(sorted, 0)).toBeNull();
    expect(periodUntil(sorted, 1)).toBe("2024-02-09");
    expect(periodUntil(sorted, 2)).toBe("2023-04-30");
  });
  it("imports JSON and base64 exports and validates them", () => {
    const data = [period("2024-02-10"), period(null)];
    expect(parseDatedSettingsImport(JSON.stringify(data))).toHaveLength(2);
    expect(parseDatedSettingsImport(btoa(JSON.stringify(data)))).toHaveLength(2);
    expect(() => parseDatedSettingsImport("nope")).toThrow("Data provided is corrupted");
    expect(() => parseDatedSettingsImport(JSON.stringify([period("2024-02-10")]))).toThrow(/forever/);
    expect(() => parseDatedSettingsImport(JSON.stringify([period(null), period(null)]))).toThrow(/duplicates/);
    expect(() => parseDatedSettingsImport(JSON.stringify([{ ...period(null), weight: 0 }]))).toThrow(/weight/);
  });
});
