import { describe, expect, it } from "vitest";
import type { Activity } from "../../lib/types";
import { COLUMNS_BY_ID, DEFAULT_COLUMN_IDS, resolveColumns } from "./columns";
import { compareHref, filterActivities, nameMatcher, printAthleteSettings, sortActivities, toCsv } from "./query";

function act(p: Omit<Partial<Activity>, "stats"> & { stats?: any }): Activity {
  return {
    id: "a",
    name: "Morning Ride",
    type: "Ride",
    startTime: "2026-05-01T08:00:00Z",
    endTime: "2026-05-01T09:00:00Z",
    athleteSnapshot: {
      gender: "men",
      age: 30,
      athleteSettings: {
        maxHr: 190,
        restHr: 65,
        lthr: { default: 170, cycling: null, running: 175 },
        cyclingFtp: 250,
        runningFtp: 300,
        swimFtp: 31,
        weight: 70
      }
    },
    settingsLack: false,
    ...p,
    stats: { distance: 42195, elevationGain: 512.3, movingTime: 3725, ...(p.stats ?? {}) }
  } as Activity;
}

const col = (id: string) => COLUMNS_BY_ID.get(id)!;

describe("columns", () => {
  it("formats distance in km / mi with original precision", () => {
    const a = act({});
    expect(col("stats.distance").display(a, "metric")).toBe("42.2 km");
    expect(col("stats.distance").display(a, "imperial")).toBe("26.2 mi");
  });
  it("formats elevation, speed, time and pace", () => {
    const a = act({ stats: { speed: { avg: 30 }, pace: { avg: 300 } } });
    expect(col("stats.elevationGain").display(a, "metric")).toBe("512.3 m");
    expect(col("stats.elevationGain").display(a, "imperial")).toBe("1680.8 ft");
    expect(col("stats.speed.avg").display(a, "imperial")).toBe("18.6 mph");
    expect(col("stats.movingTime").display(a, "metric")).toBe("01:02:05");
    expect(col("stats.pace.avg").display(a, "metric")).toBe("05:00 /km");
    expect(col("stats.pace.avg").display(a, "imperial")).toBe("08:03 /mi");
  });
  it("uses sport-specific cadence units and dashes for missing data", () => {
    expect(col("stats.cadence.avgActive").display(act({ stats: { cadence: { avgActive: 85 } } }), "metric")).toBe("85 rpm");
    expect(col("stats.cadence.avgActive").display(act({ type: "Run", stats: { cadence: { avgActive: 170 } } }), "metric")).toBe("170 spm");
    expect(col("stats.heartRate.avg").display(act({}), "metric")).toBe("-");
  });
  it("restores saved columns in definition order and falls back to defaults", () => {
    expect(resolveColumns(["type", "startTime", "bogus"]).map(c => c.id)).toEqual(["startTime", "type"]);
    expect(resolveColumns(null).map(c => c.id)).toEqual(DEFAULT_COLUMN_IDS);
    expect(DEFAULT_COLUMN_IDS.slice(0, 3)).toEqual(["startTime", "name", "type"]);
  });
});

describe("query", () => {
  const list = [
    act({ id: "1", name: "Morning Ride", type: "Ride", startTime: "2026-05-01T08:00:00Z", endTime: "2026-05-01T09:00:00Z", stats: { distance: 30000 } }),
    act({ id: "2", name: "Evening Run", type: "Run", startTime: "2026-05-03T18:00:00Z", endTime: "2026-05-03T19:00:00Z", stats: { distance: null } }),
    act({ id: "3", name: "Lunch ride with friends", type: "Ride", startTime: "2026-05-05T12:00:00Z", endTime: "2026-05-05T13:00:00Z", stats: { distance: 50000 } })
  ];
  it("matches names case-insensitively with words in order", () => {
    const m = nameMatcher("ride friends");
    expect(m("Lunch ride with friends")).toBe(true);
    expect(m("friends ride")).toBe(false);
    expect(nameMatcher("a.b")("axb")).toBe(false);
  });
  it("filters by sports and date range", () => {
    expect(filterActivities(list, { name: "", sports: ["Ride"], from: null, to: null }).map(a => a.id)).toEqual(["1", "3"]);
    expect(filterActivities(list, { name: "", sports: [], from: "2026-05-02", to: "2026-05-04" }).map(a => a.id)).toEqual(["2"]);
  });
  it("sorts with missing values last in both directions", () => {
    const c = col("stats.distance");
    expect(sortActivities(list, c, "desc").map(a => a.id)).toEqual(["3", "1", "2"]);
    expect(sortActivities(list, c, "asc").map(a => a.id)).toEqual(["1", "3", "2"]);
  });
  it("exports CSV with unit headers and quoting", () => {
    const csv = toCsv([act({ name: 'Ride, "fast"' })], [col("startTime"), col("name"), col("stats.distance")], "metric");
    const [header, row] = csv.split("\r\n");
    expect(header).toBe("Date,Name,Distance (km),Athlete Settings");
    expect(row.startsWith('2026-05-01T08:00:00.000Z,"Ride, ""fast""",42.2,')).toBe(true);
  });
  it("prints the athlete settings used", () => {
    const a = act({ stats: { scores: { stress: { hrss: 50, pss: 80 } } } });
    expect(printAthleteSettings(a, "metric")).toBe("MaxHr 190bpm. RestHr 65bpm. Lthr D:170bpm, R:175bpm. Cycling Ftp 250w. Weight 70kg.");
  });
  it("builds compare links with encoded ids", () => {
    expect(compareHref(["dev:1", "a/b"])).toBe("/activity/compare/dev%3A1,a%2Fb");
  });
});
