// Ported from appcore year-progress.service.spec.ts and year-progress-table.component.spec.ts.
import { beforeEach, describe, expect, it } from "vitest";
import { DeltaType, ProgressAtDayModel, ProgressActivityInput, ProgressMode, ProgressPreset, ProgressType } from "./models";
import {
  availableYears,
  dayOfYear,
  ERROR_NO_ACTIVITY_MODELS,
  ERROR_NO_TYPES_FILTER,
  ERROR_NO_YEAR_PROGRESS_MODELS,
  findProgressionsAtDay,
  findRollingDays,
  findSamePreset,
  progressionRows,
  progressions,
  readableTimeProgress,
  rollingTargetProgression,
  yearToDateTargetProgression
} from "./yearProgress";

/** YearProgressActivitiesFixture: a 5-day cycle Ride / Run / VirtualRide / commute Ride / rest, 2015-01-01 -> 2017-06-01. */
function fixture(): ProgressActivityInput[] {
  const out: ProgressActivityInput[] = [];
  const day = new Date(2015, 0, 1);
  const end = new Date(2017, 5, 1);
  while (day <= end) {
    const doy = dayOfYear(day);
    let commute: boolean | null = doy % 2 > 0 ? false : null;
    let stats: [string, number, number, number] | null = null;
    switch (doy % 5) {
      case 0:
        stats = ["Ride", 40000, 3600, 500];
        break;
      case 1:
        stats = ["Run", 10000, 3600, 50];
        break;
      case 2:
        stats = ["VirtualRide", 20000, 1800, 400];
        break;
      case 3:
        stats = ["Ride", 15000, 1800, 10];
        commute = true;
        break;
    }
    if (stats) {
      out.push({
        type: stats[0],
        startTime: day.toISOString(),
        commute,
        stats: { distance: stats[1], movingTime: stats[2], elevationGain: stats[3] }
      });
    }
    day.setDate(day.getDate() + 1);
  }
  return out;
}

const TODAY = new Date(2018, 2, 1, 12, 0);
const ytd = (types: string[], commute = true, indoor = true) => ({
  mode: ProgressMode.YEAR_TO_DATE,
  activityTypes: types,
  includeCommuteRide: commute,
  includeIndoorRide: indoor
});
const rolling = (types: string[], rollingDays: number) => ({ ...ytd(types), mode: ProgressMode.ROLLING, rollingDays });
const pm = (year: number, dayOfYear: number, distance: number, time: number, elevation: number, count: number) => ({
  year,
  dayOfYear,
  distance,
  time,
  elevation,
  count,
  isFuture: false
});
const RIDE_RUN = ["Ride", "VirtualRide", "Run"];

describe("year to date progression", () => {
  let activities: ProgressActivityInput[];
  beforeEach(() => {
    activities = fixture();
  });

  it("provides all available years from user activities", () => {
    expect(availableYears(activities, TODAY)).toEqual([2018, 2017, 2016, 2015]);
  });

  it("computes progression on 4 years", () => {
    const result = progressions(ytd(RIDE_RUN), true, activities, TODAY);
    expect(result.map(r => r.year)).toEqual([2015, 2016, 2017, 2018]);
    expect(result.map(r => r.progressions.length)).toEqual([365, 366, 365, 365]);
    expect(result[3].mode).toEqual(ProgressMode.YEAR_TO_DATE);
  });

  it("tags future days of current year", () => {
    const y2018 = progressions(ytd(RIDE_RUN), true, activities, TODAY)[3];
    expect(y2018.progressions.filter(p => !p.isFuture).length).toEqual(60);
    expect(y2018.progressions.filter(p => p.isFuture).length).toEqual(305);
  });

  it("computes 4 years even with a single walk on 2016-06-06", () => {
    activities.push({ type: "Walk", startTime: new Date(2016, 5, 6).toISOString(), stats: { distance: 3000, movingTime: 3600, elevationGain: 0 } });
    const result = progressions(ytd(["Walk"]), true, activities, TODAY);
    expect(result.map(r => r.year)).toEqual([2015, 2016, 2017, 2018]);
    expect(result.map(r => r.progressions.length)).toEqual([365, 366, 365, 365]);
  });

  it("computes proper totals", () => {
    const result = progressions(ytd(RIDE_RUN), true, activities, TODAY);
    expect(result[0].progressions[0]).toEqual(pm(2015, 1, 10, 1, 50, 1));
    expect(result[0].progressions[364]).toEqual(pm(2015, 365, 6205, 788400 / 3600, 70080, 292));
    expect(result[1].progressions[0]).toEqual(pm(2016, 1, 10, 1, 50, 1));
    expect(result[1].progressions[365]).toEqual(pm(2016, 366, 6215, 792000 / 3600, 70130, 293));
    expect(result[2].progressions[0]).toEqual(pm(2017, 1, 10, 1, 50, 1));
    expect(result[2].progressions[364]).toEqual(pm(2017, 365, 2580, 329400 / 3600, 29250, 122));
  });

  it("computes totals without commute rides", () => {
    const result = progressions(ytd(RIDE_RUN, false, true), true, activities, TODAY);
    expect(result[0].progressions[364]).toEqual(pm(2015, 365, 5110, 657000 / 3600, 69350, 219));
    expect(result[1].progressions[365]).toEqual(pm(2016, 366, 5120, 660600 / 3600, 69400, 220));
    expect(result[2].progressions[364]).toEqual(pm(2017, 365, 2130, 275400 / 3600, 28950, 92));
  });

  it("computes totals in imperial units", () => {
    const result = progressions(ytd(RIDE_RUN), false, activities, TODAY);
    expect(result[0].progressions[364]).toEqual(pm(2015, 365, 3856, 788400 / 3600, 229921, 292));
    expect(result[1].progressions[365]).toEqual(pm(2016, 366, 3862, 792000 / 3600, 230085, 293));
    expect(result[2].progressions[364]).toEqual(pm(2017, 365, 1603, 329400 / 3600, 95965, 122));
  });

  it("rejects empty activities, empty types and unknown types", () => {
    expect(() => progressions(ytd(RIDE_RUN), true, [], TODAY)).toThrowError(ERROR_NO_ACTIVITY_MODELS);
    expect(() => progressions(ytd([]), true, activities, TODAY)).toThrowError(ERROR_NO_TYPES_FILTER);
    expect(() => progressions(ytd(["FakeType"]), true, activities, TODAY)).toThrowError(ERROR_NO_YEAR_PROGRESS_MODELS);
  });

  it("gives progressions for a specific day", () => {
    const result = progressions(ytd(RIDE_RUN), true, activities, TODAY);
    const colors = new Map([
      [2015, "red"],
      [2016, "blue"],
      [2017, "green"],
      [2018, "purple"]
    ]);
    const atDay = findProgressionsAtDay(result, new Date(2016, 5, 1), ProgressType.DISTANCE, [2018, 2017, 2016, 2015], colors);
    expect(atDay.length).toEqual(4);
    expect(atDay.map(p => p.year)).toEqual([2018, 2017, 2016, 2015]);
    expect(atDay.map(p => dayOfYear(p.date))).toEqual([152, 152, 153, 152]);
    expect(atDay.map(p => p.value)).toEqual([0, 2580, 2595, 2580]);
    expect(atDay[3].color).toEqual("red");
    expect(atDay[0].color).toEqual("purple");
  });
});

describe("rolling progression", () => {
  const today = new Date(2019, 1, 15, 20, 0);
  const ride = (date: string, distance = 10000) => ({
    type: "Ride",
    startTime: date + "T11:00:00+0000",
    stats: { distance, movingTime: 3600, elevationGain: 100 }
  });
  const days = (from: string, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(from + "T12:00:00");
      d.setDate(d.getDate() + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
  const FEB = 31;

  it("calculates 1 week rolling distance (no previous year)", () => {
    const result = progressions(rolling(["Ride"], findRollingDays("Weeks", 1)), true, days("2019-02-01", 7).map(d => ride(d)), today);
    expect(result.length).toEqual(1);
    expect(result[0].mode).toEqual(ProgressMode.ROLLING);
    expect(result[0].year).toEqual(2019);
    expect(result[0].progressions.length).toEqual(365);
    expect(result[0].progressions[0].dayOfYear).toEqual(1);
    const distances = result[0].progressions.slice(FEB, FEB + 16).map(p => p.distance);
    expect(distances).toEqual([10, 20, 30, 40, 50, 60, 70, 60, 50, 40, 30, 20, 10, 0, 0, 0]);
  });

  it("calculates 1 week rolling distance overlapping 2 years", () => {
    const activities = [...days("2018-12-25", 7), ...days("2019-01-01", 7)].map(d => ride(d));
    const result = progressions(rolling(["Ride"], 7), true, activities, today);
    expect(result.map(r => r.year)).toEqual([2018, 2019]);
    expect(result[0].progressions.slice(356).map(p => p.distance)).toEqual([0, 0, 10, 20, 30, 40, 50, 60, 70]);
    expect(result[1].progressions.slice(0, 17).map(p => p.distance)).toEqual([
      70, 70, 70, 70, 70, 70, 70, 60, 50, 40, 30, 20, 10, 0, 0, 0, 0
    ]);
  });

  it("calculates 1 week rolling distance, time, elevation & count with multiple activities per day", () => {
    const activities = [...days("2019-02-01", 7), "2019-02-07"].map(d => ride(d));
    const p = progressions(rolling(["Ride"], 7), true, activities, today)[0].progressions.slice(FEB, FEB + 16);
    expect(p.map(x => x.distance)).toEqual([10, 20, 30, 40, 50, 60, 80, 70, 60, 50, 40, 30, 20, 0, 0, 0]);
    expect(p.map(x => x.time)).toEqual([1, 2, 3, 4, 5, 6, 8, 7, 6, 5, 4, 3, 2, 0, 0, 0]);
    expect(p.map(x => x.elevation)).toEqual([100, 200, 300, 400, 500, 600, 800, 700, 600, 500, 400, 300, 200, 0, 0, 0]);
    expect(p.map(x => x.count)).toEqual([1, 2, 3, 4, 5, 6, 8, 7, 6, 5, 4, 3, 2, 0, 0, 0]);
  });

  it("calculates 1 day rolling distance with multiple activities per day", () => {
    const activities = [...days("2019-02-01", 7).map(d => ride(d)), ride("2019-02-02", 15000)];
    const p = progressions(rolling(["Ride"], 1), true, activities, today)[0].progressions.slice(FEB, FEB + 16);
    expect(p.map(x => x.distance)).toEqual([10, 25, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("converts rolling periods to days like moment durations", () => {
    expect(findRollingDays("Days", 3)).toEqual(3);
    expect(findRollingDays("Weeks", 2)).toEqual(14);
    expect(findRollingDays("Months", 1)).toEqual(30);
    expect(findRollingDays("Months", 2)).toEqual(61);
    expect(findRollingDays("Years", 1)).toEqual(365);
  });
});

describe("target progression", () => {
  it("computes year to date target on non leap and leap years", () => {
    const t2018 = yearToDateTargetProgression(2018, 5000);
    expect(t2018.length).toEqual(365);
    expect(Math.floor((t2018[1].value - t2018[0].value) * 1000) / 1000).toEqual(13.698);
    expect(Math.round(t2018[364].value)).toEqual(5000);
    const t2016 = yearToDateTargetProgression(2016, 5000);
    expect(t2016.length).toEqual(366);
    expect(Math.floor((t2016[1].value - t2016[0].value) * 1000) / 1000).toEqual(13.661);
  });

  it("computes rolling target", () => {
    const t = rollingTargetProgression(2018, 140);
    expect(t.length).toEqual(365);
    expect(t.every(x => x.value === 140)).toBe(true);
  });
});

describe("readable time", () => {
  it.each([
    [24, "24h"],
    [1, "1h"],
    [50, "50h"],
    [76.25, "76h, 15m"],
    [29.5, "29h, 30m"],
    [15, "15h"],
    [5.815, "5h, 48m"],
    [15.3333333, "15h, 19m"],
    [0.25, "15m"],
    [-12.5, "12h, 30m"],
    [0, "0h"],
    [25.55, "25h, 33m"]
  ])("formats %s hours as %s", (hours, expected) => {
    expect(readableTimeProgress(hours)).toEqual(expected);
  });
});

describe("table rows", () => {
  const TIME = { type: ProgressType.TIME, label: "Time", unit: "hours", shortUnit: "h" };
  const at = (year: number, value: number, type = ProgressType.TIME): ProgressAtDayModel => ({
    date: new Date(year, 7, 15, 12),
    year,
    progressType: type,
    value,
    color: null
  });

  it("provides deltas between two years and with target", () => {
    const rows = progressionRows([at(2017, 24), at(2016, 36)], undefined, { dayOfYear: 227, value: 31 }, TIME);
    expect(rows[0].year).toEqual(2017);
    expect(rows[0].deltaPreviousYear.date).toEqual("August 15, 2016");
    expect(rows[0].progressTypeLabel).toEqual("Time");
    expect(rows[0].progressTypeUnit).toEqual("h");
    expect(rows[0].currentValue).toEqual(24);
    expect(rows[0].deltaPreviousYear).toMatchObject({ value: 12, type: DeltaType.NEGATIVE, signSymbol: "-", class: DeltaType.NEGATIVE });
    expect(rows[0].deltaTarget).toMatchObject({ value: 7, type: DeltaType.NEGATIVE, signSymbol: "-", class: DeltaType.NEGATIVE });
    expect(rows[1].deltaPreviousYear).toMatchObject({ date: null, value: null, type: DeltaType.NAN, signSymbol: null, class: DeltaType.NAN });
    expect(rows[1].deltaTarget).toMatchObject({ value: 5, type: DeltaType.POSITIVE, signSymbol: "+", class: DeltaType.POSITIVE });
  });

  it("gives an unsigned delta when equal and a positive one against zero", () => {
    expect(progressionRows([at(2017, 24), at(2016, 24)], undefined, null, TIME)[0].deltaPreviousYear).toMatchObject({
      value: 0,
      type: DeltaType.UNSIGNED,
      signSymbol: ""
    });
    expect(progressionRows([at(2017, 24), at(2016, 0)], undefined, null, TIME)[0].deltaPreviousYear).toMatchObject({
      value: 24,
      type: DeltaType.POSITIVE,
      signSymbol: "+"
    });
  });

  it("compares with the current year, except the current year itself", () => {
    const current = at(2017, 30);
    const rows = progressionRows([current, at(2016, 36)], current, null, TIME);
    expect(rows[0].deltaCurrentYear.type).toEqual(DeltaType.NAN);
    expect(rows[1].deltaCurrentYear).toMatchObject({ value: 6, type: DeltaType.POSITIVE });
  });

  it("blanks the target delta of a future watched day", () => {
    const rows = progressionRows([at(2017, 24)], undefined, { dayOfYear: 227, value: 31 }, TIME, y => y === 2017);
    expect(rows[0].deltaTarget?.class).toEqual(DeltaType.NAN);
  });
});

describe("presets", () => {
  const base: ProgressPreset = {
    id: "a",
    mode: ProgressMode.YEAR_TO_DATE,
    progressType: ProgressType.DISTANCE,
    activityTypes: ["Ride", "VirtualRide"],
    includeCommuteRide: true,
    includeIndoorRide: true,
    targetValue: 5000
  };

  it("detects an existing preset (with and without target)", () => {
    expect(findSamePreset([base], { ...base, id: "b", activityTypes: ["VirtualRide", "Ride"] })).toBe(base);
    expect(findSamePreset([base], { ...base, id: "b", targetValue: null })).toBeUndefined();
    const noTarget = { ...base, targetValue: null };
    expect(findSamePreset([noTarget], { ...base, id: "b", targetValue: null })).toBe(noTarget);
  });

  it("distinguishes rolling presets by period", () => {
    const r: ProgressPreset = { ...base, mode: ProgressMode.ROLLING, rollingPeriod: "Weeks", periodMultiplier: 2 };
    expect(findSamePreset([r], { ...r, id: "b" })).toBe(r);
    expect(findSamePreset([r], { ...r, id: "b", periodMultiplier: 3 })).toBeUndefined();
    expect(findSamePreset([base], { ...r, id: "b" })).toBeUndefined();
  });
});
