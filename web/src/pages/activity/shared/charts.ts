// Chart helpers shared by the activity and compare views.
import type { Layout } from "../../../components/Plot";
import { getPath, KM_TO_MILE_FACTOR } from "../../../lib/format";
import type { Activity, MeasureSystem, Peak, Streams, Zone } from "../../../lib/types";
import type { Sensor } from "./sensors";
import { smoothStream } from "./smoothing";

export type ScaleMode = "distance" | "time";

/** Plotly date axes take epoch milliseconds: durations are plotted as times on 1970-01-01 (UTC). */
export const secToDateMs = (s: number) => s * 1000;

/** x values of a stream in the chosen scale (km/mi or time). */
export function scaleValues(streams: Streams, mode: ScaleMode, ms: MeasureSystem): number[] | null {
  if (mode === "time") return streams.time?.length ? streams.time.map(secToDateMs) : null;
  if (!streams.distance?.length) return null;
  const f = ms === "imperial" ? KM_TO_MILE_FACTOR : 1;
  return streams.distance.map(m => (m / 1000) * f);
}

/** y values of a sensor stream: smoothed over time, converted to display units (paces as date ms). */
export function sensorValues(sensor: Sensor, streams: Streams, smoothingSeconds: number, ms: MeasureSystem): (number | null)[] | null {
  const raw = streams[sensor.streamKey] as number[] | undefined;
  if (!raw?.length) return null;
  const smoothed = smoothStream(streams.time, raw, smoothingSeconds);
  return smoothed.map(v => {
    if (!Number.isFinite(v)) return null;
    const c = sensor.fromStreamConvert(v, ms);
    if (c === null || !Number.isFinite(c)) return null;
    return sensor.isPace ? secToDateMs(c) : c;
  });
}

export function xAxisLayout(mode: ScaleMode, ms: MeasureSystem): Partial<Layout["xaxis"]> {
  return mode === "time"
    ? { type: "date", tickformat: "%H:%M:%S", hoverformat: "%H:%M:%S", ticksuffix: "" }
    : { type: "linear", tickformat: "", hoverformat: ".2f", ticksuffix: ms === "imperial" ? " mi" : " km" };
}

/** y-axis layout for a sensor's values (paces are reversed time axes). */
export function sensorYAxis(sensor: Sensor, ms: MeasureSystem): Partial<Layout["yaxis"]> {
  const unit = sensor.displayUnit(ms) ?? "";
  if (sensor.isPace) {
    return { type: "date", autorange: "reversed", tickformat: "%M:%S", hoverformat: "%M:%S", ticksuffix: ` ${unit}`, zeroline: false };
  }
  return { type: "linear", hoverformat: `.${sensor.defaultRoundDecimals}f`, ticksuffix: ` ${unit}`, zeroline: false };
}

// ---- Peaks ----

export const PEAK_TIME_TICKS = [1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800, 3600];

const tickText = (range: number) => (range < 60 ? `${range}s` : range < 3600 ? `${range / 60}m` : `${range / 3600}h`);

export function peaksXAxis(): Partial<Layout["xaxis"]> {
  return {
    type: "log",
    fixedrange: true,
    tickmode: "array",
    tickvals: PEAK_TIME_TICKS,
    ticktext: PEAK_TIME_TICKS.map(tickText),
    title: { text: "Duration" }
  };
}

export function peaksOf(a: Activity, sensor: Sensor): Peak[] | null {
  if (!sensor.peaksPath) return null;
  const peaks = getPath(a.stats, sensor.peaksPath) as Peak[] | null | undefined;
  return peaks?.length ? peaks.filter(p => Number.isFinite(p.result)) : null;
}

/** Peak curve points: x = duration (s), y = converted result. */
export function peakPoints(peaks: Peak[], sensor: Sensor, ms: MeasureSystem): { x: number[]; y: (number | null)[] } {
  return {
    x: peaks.map(p => p.range),
    y: peaks.map(p => {
      const v = sensor.fromStreamConvert(p.result as number, ms);
      return v === null ? null : sensor.isPace ? secToDateMs(v) : v;
    })
  };
}

// ---- Zones ----

export function zonesOf(a: Activity, sensor: Sensor): Zone[] | null {
  if (!sensor.zonesPath) return null;
  const zones = getPath(a.stats, sensor.zonesPath) as Zone[] | null | undefined;
  return zones?.length && zones.some(z => z.s > 0) ? zones : null;
}

/** "Z3 120-150 bpm"-style labels with bounds converted to the user's measure system. */
export function zoneLabel(zone: Zone, index: number, sensor: Sensor, ms: MeasureSystem): string {
  const from = sensor.displayZoneBoundValue(sensor.fromZoneBoundConvert(zone.from, ms));
  const to = sensor.displayZoneBoundValue(sensor.fromZoneBoundConvert(zone.to, ms));
  return `Z${index + 1} ${from}-${to} ${sensor.displayUnit(ms) ?? ""}`.trim();
}
