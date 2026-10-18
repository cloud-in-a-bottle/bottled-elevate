// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SplitCalculator } from "./split-calculator";

describe("SplitCalculator", () => {
  it("finds the best average window over a distance scale", () => {
    const scale = [0, 10, 20, 30, 40, 50];
    const data = [1, 1, 5, 5, 1, 1];
    const r = new SplitCalculator(scale, data).compute(10);
    expect(r).toEqual({ value: 5, start: 2, end: 3 });
  });

  it("matches a naive slice+mean implementation", () => {
    const scale: number[] = [];
    const data: number[] = [];
    let t = 0;
    for (let i = 0; i < 500; i++) {
      t += 1 + ((i * 7) % 3);
      scale.push(t);
      data.push(100 + 50 * Math.sin(i / 13) + ((i * 31) % 17));
    }
    const naive = (range: number) => {
      let max = -Infinity;
      let s = 0;
      let e = 0;
      let w = 0;
      for (let c = 0; c < scale.length; ) {
        if (scale[c] - scale[w] < range) {
          c++;
          continue;
        }
        const win = data.slice(w, c + 1);
        const avg = win.reduce((a, b) => a + b, 0) / win.length;
        if (avg > max) {
          max = avg;
          s = w;
          e = c;
        }
        w++;
      }
      return { value: Math.round(max * 1000) / 1000, start: s, end: e };
    };
    for (const range of [5, 60, 300, 900]) {
      expect(new SplitCalculator(scale, data).compute(range)).toEqual(naive(range));
    }
  });

  it("throws when range exceeds the scale and computeRanges skips it", () => {
    const calc = new SplitCalculator([0, 1, 2], [1, 2, 3]);
    expect(() => calc.compute(10)).toThrow(RangeError);
    expect(calc.computeRanges([1, 10])).toEqual([{ range: 1, result: 2.5, start: 1, end: 2 }]);
  });
});
