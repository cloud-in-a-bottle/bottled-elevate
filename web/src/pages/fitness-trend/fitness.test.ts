// Ported from appcore fitness.service.spec.ts and day-fitness-trend.model.spec.ts.
import dayjs from "dayjs";
import { beforeEach, describe, expect, it } from "vitest";
import type { Activity, AthleteSnapshot } from "../../lib/types";
import {
  computeTrend,
  DEFAULT_CONFIG,
  findTrainingZone,
  FitnessError,
  type FitnessOptions,
  type FitnessTrendConfig,
  floorTo,
  formatPatternsForStorage,
  generateDailyStress,
  normalizeConfig,
  prepare,
  printTypesCount
} from "./fitness";

const athlete = (): AthleteSnapshot => ({
  gender: "men",
  age: 30,
  athleteSettings: {
    maxHr: 190,
    restHr: 60,
    lthr: { default: 163, cycling: null, running: null },
    cyclingFtp: 150,
    runningFtp: 300,
    swimFtp: 31,
    weight: 70
  }
});

/** Port of FakeActivityHelper.create: every given score maps straight onto the stress scores. */
function fake(
  id: number,
  name: string,
  type: string,
  dateStr: string,
  avgHr: number | null,
  avgWatts: number | null,
  hasPowerMeter: boolean,
  avgPace?: number
): Activity {
  const start = dayjs(dateStr);
  const isRunType = type === "Run" || type === "VirtualRun";
  const stress = {
    hrss: avgHr,
    hrssPerHour: avgHr,
    trimp: avgHr,
    trimpPerHour: avgHr,
    pss: avgWatts,
    pssPerHour: avgWatts,
    rss: avgPace !== undefined && isRunType ? avgPace : null,
    rssPerHour: null,
    sss: avgPace !== undefined && type === "Swim" ? avgPace : null,
    sssPerHour: null
  };
  return {
    id: String(id),
    name,
    type,
    startTime: start.toISOString(),
    startTimestamp: start.unix(),
    hasPowerMeter,
    athleteSnapshot: athlete(),
    stats: { distance: 30000, movingTime: 3600, elapsedTime: 3600, scores: { stress } }
  } as unknown as Activity;
}

let config: FitnessTrendConfig;
let opts: FitnessOptions;

beforeEach(() => {
  config = normalizeConfig({ ...DEFAULT_CONFIG, allowEstimatedPowerStressScore: false, allowEstimatedRunningStressScore: false });
  opts = { powerMeterEnable: true, swimEnable: true, today: dayjs("2015-12-01 12:00") };
});

const count = <T>(list: T[], key: keyof T) => list.filter(x => x[key]).length;

describe("prepare fitness activities", () => {
  it("only heart rate based activities w/ power=OFF swim=OFF mode=TRIMP", () => {
    config.heartRateImpulseMode = "TRIMP";
    const result = prepare(
      [
        fake(1, "SuperHeartRateRide 01", "Ride", "2018-01-01", 150, null, false),
        fake(2, "SuperHeartRateRide 02", "Ride", "2018-01-15", 180, null, false),
        fake(3, "SuperHeartRateRide 03", "Ride", "2018-01-30", 135, null, false)
      ],
      config,
      { ...opts, powerMeterEnable: false, swimEnable: false }
    );
    expect(result.length).toBe(3);
    expect(count(result, "heartRateStressScore")).toBe(0);
    expect(count(result, "trainingImpulseScore")).toBe(3);
    expect(count(result, "powerStressScore")).toBe(0);
    expect(count(result, "swimStressScore")).toBe(0);
  });

  it("only power based activities w/ power=ON swim=OFF mode=HRSS", () => {
    const result = prepare(
      [
        fake(1, "SuperPoweredRide 01", "Ride", "2018-01-01", null, 250, true),
        fake(2, "SuperPoweredRide 02", "Ride", "2018-01-15", null, 275, true),
        fake(3, "SuperPoweredRide 03", "Ride", "2018-01-30", null, 190, true)
      ],
      config,
      { ...opts, swimEnable: false }
    );
    expect(result.length).toBe(3);
    expect(count(result, "trainingImpulseScore")).toBe(0);
    expect(count(result, "powerStressScore")).toBe(3);
  });

  it("only power based activities w/ power=OFF → no PSS", () => {
    const result = prepare(
      [fake(1, "P1", "Ride", "2018-01-01", null, 250, true), fake(2, "P2", "Ride", "2018-01-15", null, 275, true)],
      config,
      { ...opts, powerMeterEnable: false, swimEnable: false }
    );
    expect(result.length).toBe(2);
    expect(count(result, "powerStressScore")).toBe(0);
  });

  const mixed = () => [
    fake(1, "Power Ride", "Ride", "2018-01-01", null, 250, true),
    fake(2, "HR Ride", "Ride", "2018-01-15", 190, 150, false),
    fake(3, "No sensor Ride", "Ride", "2018-01-30", null, 150, false),
    fake(4, "HR Run", "Run", "2018-02-02", 175, null, false, 300),
    fake(5, "HR Run", "Run", "2018-02-03", 182, null, false, 300),
    fake(6, "No sensor Run", "Run", "2018-02-08", null, null, false, 300),
    fake(7, "No sensor Run 2", "Run", "2018-02-08", null, null, false, 300),
    fake(8, "Swimming", "Swim", "2018-02-09", null, null, false, 419)
  ];

  it("power=ON swim=ON mode=HRSS est.PSS=ON est.RSS=ON", () => {
    config.allowEstimatedPowerStressScore = true;
    config.allowEstimatedRunningStressScore = true;
    const result = prepare([...mixed(), fake(9, "No sensor VirtualRun 1", "VirtualRun", "2018-02-10", null, null, false, 300)], config, opts);
    expect(result.length).toBe(9);
    expect(count(result, "heartRateStressScore")).toBe(3);
    expect(count(result, "powerStressScore")).toBe(3);
    expect(count(result, "runningStressScore")).toBe(5);
    expect(count(result, "swimStressScore")).toBe(1);
  });

  it("power=ON swim=ON mode=HRSS est.PSS=OFF est.RSS=OFF", () => {
    const result = prepare(mixed(), config, opts);
    expect(result.length).toBe(8);
    expect(count(result, "heartRateStressScore")).toBe(3);
    expect(count(result, "powerStressScore")).toBe(1);
    expect(count(result, "runningStressScore")).toBe(0);
    expect(count(result, "swimStressScore")).toBe(1);
  });

  it("power=OFF swim=OFF mode=HRSS est.PSS=ON est.RSS=ON", () => {
    config.allowEstimatedPowerStressScore = true;
    config.allowEstimatedRunningStressScore = true;
    const result = prepare(mixed(), config, { ...opts, powerMeterEnable: false, swimEnable: false });
    expect(count(result, "heartRateStressScore")).toBe(3);
    expect(count(result, "powerStressScore")).toBe(0);
    expect(count(result, "runningStressScore")).toBe(4);
    expect(count(result, "swimStressScore")).toBe(0);
  });

  it("mode=TRIMP ignores PSS, RSS and SSS", () => {
    config.heartRateImpulseMode = "TRIMP";
    config.allowEstimatedPowerStressScore = true;
    config.allowEstimatedRunningStressScore = true;
    const result = prepare(
      [
        fake(1, "Power Ride", "Ride", "2018-01-01", null, 250, true),
        fake(2, "No sensor Ride", "Ride", "2018-01-30", null, 150, false),
        fake(3, "No sensor Run", "Run", "2018-02-08", null, null, false, 300),
        fake(4, "No sensor Run 2", "Run", "2018-02-08", null, null, false, 300),
        fake(5, "Swimming", "Swim", "2018-02-09", null, null, false, 419),
        fake(6, "HR Ride", "Ride", "2018-02-11", 165, 150, false)
      ],
      config,
      opts
    );
    expect(result.length).toBe(6);
    const byId = (id: string) => result.find(a => a.id === id)!;
    expect(byId("1").powerStressScore).toBeUndefined();
    expect(byId("2").powerStressScore).toBeUndefined();
    expect(byId("3").runningStressScore).toBeUndefined();
    expect(byId("5").swimStressScore).toBeUndefined();
    expect(byId("6").heartRateStressScore).toBeUndefined();
    expect(byId("6").powerStressScore).toBeUndefined();
    expect(typeof byId("6").trainingImpulseScore).toBe("number");
  });

  it("needs the matching FTP on each activity's athlete snapshot", () => {
    config.allowEstimatedPowerStressScore = true;
    config.allowEstimatedRunningStressScore = true;
    const a1 = fake(1, "SuperPoweredRide 01", "Ride", "2018-01-01", null, 250, true);
    a1.athleteSnapshot.athleteSettings.cyclingFtp = null;
    const a5 = fake(5, "Swimming 02", "Swim", "2018-02-10", null, null, false, 419);
    a5.athleteSnapshot.athleteSettings.swimFtp = null;
    const a8 = fake(8, "No sensor Run 2", "Run", "2018-02-17", null, null, false, 300);
    a8.athleteSnapshot.athleteSettings.runningFtp = null;
    const a10 = fake(10, "SuperPoweredRide Est 02", "Ride", "2018-03-01", null, 250, false);
    a10.athleteSnapshot.athleteSettings.cyclingFtp = null;
    const result = prepare(
      [
        a1,
        fake(2, "SuperPoweredRide 02", "Ride", "2018-01-15", null, 275, true),
        fake(3, "SuperPoweredRide 03", "Ride", "2018-01-30", null, 190, true),
        fake(4, "Swimming 01", "Swim", "2018-02-09", null, null, false, 419),
        a5,
        fake(6, "SuperHeartRateRun 01", "Run", "2018-02-11", 185, null, false),
        fake(7, "No sensor Run 1", "Run", "2018-02-16", null, null, false, 300),
        a8,
        fake(9, "SuperPoweredRide Est 01", "Ride", "2018-03-01", null, 250, false),
        a10
      ],
      config,
      opts
    );
    expect(result.length).toBe(10);
    expect(count(result, "heartRateStressScore")).toBe(1);
    expect(count(result, "powerStressScore")).toBe(3);
    expect(count(result, "swimStressScore")).toBe(1);
    expect(count(result, "runningStressScore")).toBe(1);
  });

  it("skips activity types", () => {
    config.heartRateImpulseMode = "TRIMP";
    const result = prepare(
      [
        fake(151, "SuperHeartRateRide 01", "Ride", "2018-01-01", 150, null, false),
        fake(235, "Super E-Bike Ride", "EBikeRide", "2018-01-15", 90, null, false),
        fake(666, "SuperHeartRateRide 02", "Ride", "2018-01-30", 135, null, false),
        fake(999, "SuperHeartRateRun 01", "Run", "2018-01-30", 185, null, false)
      ],
      config,
      { ...opts, powerMeterEnable: false, swimEnable: false, skipActivityTypes: ["Run", "EBikeRide"] }
    );
    expect(result.length).toBe(2);
    expect(count(result, "trainingImpulseScore")).toBe(2);
  });

  const six = () => [
    fake(1, "Ride 01", "Ride", "2018-01-01", 150, null, false),
    fake(2, "Ride 02 #MTBDH", "Ride", "2018-01-15", 150, null, false),
    fake(3, "Ride 03 #MTBDH", "Ride", "2018-01-16", 150, null, false),
    fake(4, "Ride 04", "Ride", "2018-01-17", 150, null, false),
    fake(5, "Ride 05 @skipMe", "Ride", "2018-01-18", 150, null, false),
    fake(6, "Run 01", "Run", "2018-01-19", 150, null, false)
  ];

  it("ignores activities before a user defined date", () => {
    config.ignoreBeforeDate = "2018-01-16";
    const result = prepare(six(), config, opts);
    expect(result.length).toBe(4);
    expect(result[0].id).toBe("3");
  });

  it("ignores activities matching exclusion patterns", () => {
    config.ignoreActivityNamePatterns = ["#MTBDH", "@skipMe"];
    const result = prepare(six(), config, opts);
    expect(result.map(a => a.name)).toEqual(["Ride 01", "Ride 04", "Run 01"]);
  });

  it("ignores activities matching exclusion patterns and before date", () => {
    config.ignoreBeforeDate = "2018-01-17";
    config.ignoreActivityNamePatterns = ["#MTBDH", "@skipMe"];
    const result = prepare(six(), config, opts);
    expect(result.map(a => a.id)).toEqual(["4", "6"]);
  });

  it("rejects when no activities", () => {
    expect(() => prepare([], config, opts)).toThrowError(FitnessError);
    try {
      prepare([], config, opts);
    } catch (e) {
      expect((e as FitnessError).code).toBe("NO_ACTIVITIES");
    }
  });

  it("rejects when all activities are filtered", () => {
    config.ignoreActivityNamePatterns = ["Ride"];
    try {
      prepare(six().slice(0, 4), config, opts);
      expect.unreachable();
    } catch (e) {
      expect((e as FitnessError).code).toBe("ALL_ACTIVITIES_FILTERED");
    }
  });
});

// Shared by the daily stress & trend tests (spec: 2018-01-01 .. 2018-02-14, today 2018-02-15).
function scenario(): Activity[] {
  const swim1 = fake(8, "Swimming", "Swim", "2018-02-09", null, null, false, 419);
  const swim2 = fake(16, "Swimming", "Swim", "2018-02-14", null, null, false, 419);
  return [
    fake(0, "Power Ride + HR", "Ride", "2018-01-01", 190, 150, true),
    fake(1, "Power Ride", "Ride", "2018-01-02", null, 150, true),
    fake(2, "HR Ride", "Ride", "2018-01-15", 190, 150, false),
    fake(3, "No sensor Ride 2", "Ride", "2018-01-30", null, 150, false),
    fake(4, "HR Run", "Run", "2018-02-02", 190, null, false, 300),
    fake(5, "HR Run 2", "Run", "2018-02-03", 190, null, false, 300),
    fake(6, "No sensor Run", "Run", "2018-02-07", null, null, false, 300),
    fake(7, "No sensor Run 2", "Run", "2018-02-08", null, null, false, 300),
    swim1,
    fake(9, "HR Run 3", "Run", "2018-02-12", 190, null, false, 300),
    fake(10, "HR + Est power Ride", "Ride", "2018-02-12", 190, 150, false),
    fake(11, "HR Run 4", "Run", "2018-02-13", 190, null, false, 300),
    fake(12, "No sensor Run 3", "Run", "2018-02-13", null, null, false, 300),
    fake(13, "Power Ride", "Ride", "2018-02-14", null, 150, true),
    fake(14, "HR + Est power Ride", "Ride", "2018-02-14", 190, 150, false),
    fake(15, "HR Run 4", "Run", "2018-02-14", 190, null, false, 300),
    swim2
  ];
}

describe("generate daily stress", () => {
  it("builds real & preview days with grouped stress scores", () => {
    config.allowEstimatedPowerStressScore = true;
    config.allowEstimatedRunningStressScore = true;
    const daily = generateDailyStress(scenario(), config, { ...opts, today: dayjs("2018-02-15 12:00") });

    expect(daily.length).toBe(61);
    const preview = daily.filter(d => d.previewDay);
    const real = daily.filter(d => !d.previewDay);
    expect(preview.length).toBe(14);
    expect(real.length).toBe(47);
    expect(daily[0].dateString).toBe("2017-12-31");
    expect(real[real.length - 1].dateString).toBe("2018-02-15");
    expect(daily[daily.length - 1].dateString).toBe("2018-03-01");

    const day = (...ids: number[]) => daily.find(d => d.ids.join() === ids.map(String).join())!;
    const f = (v: number | null) => Math.floor(v ?? 0);

    let d = day(0);
    expect([f(d.powerStressScore), f(d.heartRateStressScore), f(d.finalStressScore)]).toEqual([150, 190, 150]);
    expect(d.runningStressScore).toBeNull();
    expect(d.swimStressScore).toBeNull();

    d = day(2);
    expect([f(d.powerStressScore), f(d.heartRateStressScore), f(d.finalStressScore)]).toEqual([150, 190, 190]);

    d = day(3);
    expect([f(d.powerStressScore), f(d.finalStressScore)]).toEqual([150, 150]);
    expect(d.heartRateStressScore).toBeNull();

    d = day(4);
    expect([f(d.runningStressScore), f(d.heartRateStressScore), f(d.finalStressScore)]).toEqual([300, 190, 190]);
    expect(d.powerStressScore).toBeNull();

    d = day(6);
    expect([f(d.runningStressScore), f(d.finalStressScore)]).toEqual([300, 300]);

    d = day(8);
    expect(typeof d.swimStressScore).toBe("number");
    expect(typeof d.finalStressScore).toBe("number");

    d = day(9, 10);
    expect([f(d.heartRateStressScore), f(d.powerStressScore), f(d.runningStressScore), f(d.finalStressScore)]).toEqual([
      380, 150, 300, 380
    ]);

    d = day(11, 12);
    expect([f(d.heartRateStressScore), f(d.runningStressScore), f(d.finalStressScore)]).toEqual([190, 600, 490]);

    d = day(13, 14, 15, 16);
    expect([
      f(d.heartRateStressScore),
      f(d.powerStressScore),
      f(d.runningStressScore),
      f(d.swimStressScore),
      f(d.finalStressScore)
    ]).toEqual([380, 300, 300, 419, 949]);
  });

  it("days without hr or power data have no stress", () => {
    const daily = generateDailyStress(
      [
        fake(1, "R1", "Ride", "2018-01-01", null, null, false),
        fake(2, "R2", "Ride", "2018-01-15", null, null, false),
        fake(3, "R3", "Ride", "2018-01-30", null, null, false)
      ],
      config,
      { ...opts, today: dayjs("2018-02-15 12:00") }
    );
    expect(daily.length).toBe(61);
    for (const id of ["1", "2", "3"]) {
      const d = daily.find(x => x.ids[0] === id)!;
      expect(d.finalStressScore ?? 0).toBe(0);
      expect(d.powerStressScore ?? 0).toBe(0);
      expect(d.heartRateStressScore ?? 0).toBe(0);
    }
  });
});

describe("compute fitness trend", () => {
  it("computes fitness, fatigue & form", () => {
    config.allowEstimatedPowerStressScore = true;
    config.allowEstimatedRunningStressScore = true;
    const trend = computeTrend(scenario(), config, { ...opts, today: dayjs("2018-02-15 12:00") });
    expect(trend.length).toBe(61);

    const day = (...ids: number[]) => trend.find(d => d.ids.join() === ids.map(String).join())!;

    let d = day(2);
    expect(d.activitiesName).toContain("HR Ride");
    expect(d.heartRateStressScore).toBe(190);
    expect(d.powerStressScore).toBe(150);
    expect(d.runningStressScore).toBeNull();
    expect(d.finalStressScore).toBe(190);
    expect([floorTo(d.atl, 2), floorTo(d.ctl, 2), floorTo(d.tsb, 2)]).toEqual([31.11, 9.58, -1.48]);

    d = day(5);
    expect(d.activitiesName[0]).toBe("HR Run 2");
    expect(d.runningStressScore).toBe(300);
    expect(d.finalStressScore).toBe(190);
    expect([floorTo(d.atl, 2), floorTo(d.ctl, 2), floorTo(d.tsb, 2)]).toEqual([60.55, 18.14, -26.68]);

    d = day(7);
    expect([floorTo(d.atl, 2), floorTo(d.ctl, 2), floorTo(d.tsb, 2)]).toEqual([104.2, 30.05, -50.59]);

    d = day(9, 10);
    expect([floorTo(d.atl, 2), floorTo(d.ctl, 2), floorTo(d.tsb, 2)]).toEqual([145.76, 45.44, -72.42]);
  });

  it("starts from initial fitness and fatigue values", () => {
    config.initializedFitnessTrendModel = { atl: 100, ctl: 50 };
    const trend = computeTrend(
      [fake(1, "Ride 01", "Ride", "2015-11-15", 150, null, false), fake(2, "Ride 02", "Ride", "2015-11-20", 150, null, false)],
      config,
      opts
    );
    expect(trend[0].ctl).toBe(50);
    expect(trend[0].atl).toBe(100);
    expect(trend[0].tsb).toBe(-50);
    expect(trend[1].ctl).toBeGreaterThan(50);
    expect(trend[1].atl).toBeGreaterThan(100);
  });
});

describe("day fitness trend helpers", () => {
  it.each([
    [-39, "OVERLOAD"],
    [-30, "OVERLOAD"],
    [-15, "OPTIMAL"],
    [-10, "OPTIMAL"],
    [0, "NEUTRAL"],
    [5, "NEUTRAL"],
    [10, "FRESHNESS"],
    [15, "FRESHNESS"],
    [25, "FRESHNESS"],
    [26, "TRANSITION"],
    [99, "TRANSITION"]
  ])("form %d is in the %s zone", (tsb, zone) => {
    expect(findTrainingZone(tsb)).toBe(zone);
  });

  it("prints types count", () => {
    expect(printTypesCount(["Ride", "Ride", "Ride", "Run", "Run"])).toBe("3 Rides, 2 Runs");
    const mixed = ["Ride", "VirtualRide", "AlpineSki", "Run", "Ride", "Run", "Ride"];
    expect(printTypesCount(mixed)).toBe("3 Rides, 2 Runs, 1 VirtualRide, 1 AlpineSki");
    expect(printTypesCount(mixed, 2)).toBe("3 Rides, 2 Runs & 2 more");
    expect(printTypesCount(["Ride", "Run", "Ride", "Run", "Ride"], 2)).toBe("3 Rides, 2 Runs");
  });

  it("formats exclusion patterns", () => {
    expect(formatPatternsForStorage(" #MTBDH \n\n@skip\r\n#MTBDH")).toEqual(["#MTBDH", "@skip"]);
    expect(formatPatternsForStorage("  \n")).toBeNull();
  });

  it("normalizes legacy configs", () => {
    const c = normalizeConfig({ heartRateImpulseMode: 1 as any, ignoreBeforeDate: "2018-01-16T00:00:00" });
    expect(c.heartRateImpulseMode).toBe("TRIMP");
    expect(c.ignoreBeforeDate).toBe("2018-01-16");
    expect(c.allowEstimatedPowerStressScore).toBe(true);
  });
});
