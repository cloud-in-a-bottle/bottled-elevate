// Best average of a data stream over a scale range (distance or time). Port of
// appcore/modules/shared/sync/compute/split-calculator.ts.
import { round } from "../../../lib/format";

export interface SplitResult {
  value: number | null;
  start: number;
  end: number;
}

export class SplitCalculator {
  constructor(private readonly scale: number[], private readonly data: number[]) {}

  /** Throws RangeError when targetRange exceeds the scale. */
  compute(targetRange: number): SplitResult {
    if (!this.scale.length || targetRange > this.scale[this.scale.length - 1]) {
      throw new RangeError("Requested target range is greater than scale range length.");
    }

    let maxAvg = -Infinity;
    let winStart = 0;
    let start = 0;
    let end = 0;
    // Running sum of data[winStart..currIdx] replaces the original per-window slice+mean (same result).
    let sum = 0;
    let summedTo = -1;

    for (let currIdx = 0; currIdx < this.scale.length; ) {
      if (this.scale[currIdx] - this.scale[winStart] < targetRange) {
        currIdx++;
        continue;
      }
      while (summedTo < currIdx) sum += this.data[++summedTo];
      const avg = sum / (currIdx - winStart + 1);
      if (avg > maxAvg) {
        maxAvg = avg;
        start = winStart;
        end = currIdx;
      }
      sum -= this.data[winStart];
      winStart++;
    }

    return { value: Number.isFinite(maxAvg) ? round(maxAvg, 3) : null, start, end };
  }

  computeRanges(ranges: number[]): { range: number; result: number | null; start: number; end: number }[] {
    const out: { range: number; result: number | null; start: number; end: number }[] = [];
    for (const range of ranges) {
      try {
        const r = this.compute(range);
        out.push({ range, result: r.value, start: r.start, end: r.end });
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
      }
    }
    return out;
  }
}
