// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Activity } from "../../lib/types";
import { StatsDef } from "../activity/shared/stats";
import { statChartPoints, type ComparedWorkout } from "./compare-model";

const workout = (stats: Record<string, unknown>, start: number): ComparedWorkout => ({
  activity: { stats, startTimestamp: start, type: "Run", hasPowerMeter: false } as unknown as Activity,
  streams: null,
  color: "#000",
  label: `w${start}`
});

describe("statChartPoints", () => {
  it("plots numeric stats in display units and skips missing values", () => {
    const pts = statChartPoints(StatsDef.HeartRate.avg, [workout({ heartRate: { avg: 150.4 } }, 1), workout({ heartRate: null }, 2)], "metric");
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ x: 0, y: 150, isTime: false, text: "w1: 150 bpm" });
  });

  it("plots paces as times, converted per measure system", () => {
    const [metric] = statChartPoints(StatsDef.RunPace.avg, [workout({ pace: { avg: 300 } }, 1)], "metric");
    expect(metric).toMatchObject({ isTime: true, seconds: 300, y: 300000 });
    const [imperial] = statChartPoints(StatsDef.RunPace.avg, [workout({ pace: { avg: 300 } }, 1)], "imperial");
    expect(imperial.seconds).toBe(483); // 8:03 /mi
  });

  it("converts imperial distances", () => {
    const [p] = statChartPoints(StatsDef.Distance.distance, [workout({ distance: 10000 }, 1)], "imperial");
    expect(p.y).toBe(6.2);
  });
});
