import { Delta, DeltaType, ProgressMode, ProgressType, YearProgressTypeModel } from "./models";
import { readableTimeProgress } from "./yearProgress";

/** Distance/elevation as "1,234 km", time as "12h, 30m", count as a plain number. */
export function formatProgressValue(value: number, type: YearProgressTypeModel): string {
  if (type.type === ProgressType.TIME) return readableTimeProgress(value);
  const n = Math.round(value).toLocaleString();
  return type.shortUnit ? `${n} ${type.shortUnit}` : n;
}

export function formatDelta(delta: Delta | null | undefined, type: YearProgressTypeModel): string {
  if (!delta || delta.type === DeltaType.NAN || delta.value === null) return "∅";
  return `${delta.signSymbol ? delta.signSymbol + " " : ""}${formatProgressValue(delta.value, type)}`;
}

/** "last rolling month" / "3 last rolling weeks". */
export function rollingLabel(rollingPeriod: string, periodMultiplier: number): string {
  const p = rollingPeriod.toLowerCase();
  return periodMultiplier === 1 ? `last rolling ${p.slice(0, -1)}` : `${periodMultiplier} last rolling ${p}`;
}

export const modeLabel = (mode: ProgressMode) => (mode === ProgressMode.ROLLING ? "Rolling" : "Year to date");
