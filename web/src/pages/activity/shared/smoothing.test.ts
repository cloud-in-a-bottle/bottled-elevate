// @vitest-environment node
import { describe, expect, it } from "vitest";
import { smoothStream } from "./smoothing";

describe("smoothStream", () => {
  const oneHz = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("returns values untouched for a zero window", () => {
    const values = [1, 5, 3];
    expect(smoothStream([0, 1, 2], values, 0)).toBe(values);
  });

  it("keeps a constant stream constant", () => {
    const values = new Array(60).fill(200);
    expect(smoothStream(oneHz(60), values, 30)).toEqual(values);
  });

  it("averages a step down to intermediate values around the edge", () => {
    const time = oneHz(60);
    const values = time.map(t => (t < 30 ? 0 : 100));
    const smoothed = smoothStream(time, values, 10);
    expect(smoothed[10]).toEqual(0);
    expect(smoothed[50]).toEqual(100);
    expect(smoothed[30]).toBeGreaterThan(0);
    expect(smoothed[30]).toBeLessThan(100);
    expect(smoothed[29] + smoothed[30]).toBeCloseTo(100, 5);
  });

  it("windows by time rather than sample count on non-uniform streams", () => {
    expect(smoothStream([0, 50, 100], [0, 100, 0], 10)).toEqual([0, 100, 0]);
  });

  it("passes non-finite samples through and excludes them from neighbors averages", () => {
    const smoothed = smoothStream(oneHz(5), [10, null, 10, 10, 10], 4);
    expect(smoothed[1]).toBeNull();
    expect(smoothed[0]).toEqual(10);
    expect(smoothed[2]).toEqual(10);
  });
});
