// Best splits: best average of each stream over distance/time ranges (client-side SplitCalculator).
// Ranges are configurable and kept as a server pref, shared by every activity.
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { Button, IconButton } from "../../components/ui";
import { api } from "../../lib/api";
import { KM_TO_MILE_FACTOR, militaryToSec, round, secToMilitary } from "../../lib/format";
import { toast } from "../../lib/toast";
import type { Activity, MeasureSystem, Streams } from "../../lib/types";
import { DistanceSensor, provideSensors, type Sensor } from "./shared/sensors";
import { SplitCalculator } from "./shared/split-calculator";
import type { Range } from "./AnalysisGraph";

const SPLIT_STREAMS: (keyof Streams)[] = ["velocity_smooth", "heartrate", "watts", "cadence"];
const TITLES: Partial<Record<keyof Streams, string>> = {
  velocity_smooth: "Best Speed",
  heartrate: "Best Heart Rate",
  watts: "Best Power",
  cadence: "Best Cadence"
};
const PREF_KEY = "activity.bestSplits";

export interface SplitRanges {
  /** meters */
  distances: number[];
  /** seconds */
  times: number[];
}

export const defaultSplitRanges = (ms: MeasureSystem): SplitRanges => ({
  distances: [1000, 5000, 10000].map(d => (ms === "imperial" ? d / KM_TO_MILE_FACTOR : d)),
  times: [60, 5 * 60, 10 * 60, 20 * 60]
});

interface SplitRow {
  type: "distance" | "time";
  range: number;
  results: Map<keyof Streams, { value: number; indexes: Range }>;
}

export function computeSplits(streams: Streams, sensors: Sensor[], ranges: SplitRanges): SplitRow[] {
  const rows: SplitRow[] = [];
  const run = (type: SplitRow["type"], scale: number[] | undefined, range: number) => {
    if (!scale || scale.length < 2 || range > scale[scale.length - 1]) return;
    const results = new Map<keyof Streams, { value: number; indexes: Range }>();
    for (const s of sensors) {
      const data = streams[s.streamKey] as number[] | undefined;
      if (!data?.length) continue;
      try {
        const best = new SplitCalculator(scale, data).compute(range);
        if (best.value !== null && Number.isFinite(best.value)) results.set(s.streamKey, { value: best.value, indexes: [best.start, best.end] });
      } catch {
        // range longer than the activity
      }
    }
    rows.push({ type, range, results });
  };
  for (const d of [...ranges.distances].sort((a, b) => a - b)) run("distance", streams.distance, d);
  for (const t of [...ranges.times].sort((a, b) => a - b)) run("time", streams.time, t);
  return rows;
}

/** A best average stream value (stream units) formatted like the sensor's stream display. */
function printValue(sensor: Sensor, value: number, ms: MeasureSystem): string {
  const c = sensor.fromStreamConvert(value, ms);
  if (c === null || !Number.isFinite(c)) return "-";
  const v = sensor.isPace ? secToMilitary(c, true) : round(c, sensor.defaultRoundDecimals);
  return `${v} ${sensor.displayUnit(ms) ?? ""}`.trim();
}

export function BestSplitsTab(props: {
  activity: Activity;
  streams: Streams;
  measureSystem: MeasureSystem;
  selected: Range | null;
  onSelect: (r: Range) => void;
}) {
  const [pref, { mutate }] = createResource(() => api.pref<SplitRanges>(PREF_KEY).catch(() => null));
  const ranges = () => pref() ?? defaultSplitRanges(props.measureSystem);
  const sensors = createMemo(() => provideSensors(props.activity, SPLIT_STREAMS).filter(s => (props.streams[s.streamKey] as number[] | undefined)?.length));
  const rows = createMemo(() => (pref.loading ? [] : computeSplits(props.streams, sensors(), ranges())));
  const maxDistance = () => props.streams.distance?.[props.streams.distance.length - 1] ?? 0;
  const maxTime = () => props.streams.time?.[props.streams.time.length - 1] ?? 0;

  const defaultCustomDistance = () => {
    const d = (maxDistance() / 1000) * (props.measureSystem === "imperial" ? KM_TO_MILE_FACTOR : 1) * 0.75;
    return Math.max(1, d - (d % 5));
  };
  const defaultCustomTime = () => {
    const t = maxTime() * 0.75;
    return secToMilitary(Math.max(60, t - (t % 300)));
  };
  const [distanceInput, setDistanceInput] = createSignal("");
  const [timeInput, setTimeInput] = createSignal("");

  const save = async (next: SplitRanges | null) => {
    mutate(next);
    try {
      if (next) await api.savePref(PREF_KEY, next);
      else await api.deletePref(PREF_KEY);
    } catch (e) {
      toast(`Could not save split ranges: ${(e as Error).message}`, "error");
    }
  };

  const addDistance = () => {
    const v = parseFloat(distanceInput() || String(defaultCustomDistance()));
    if (!(v > 0)) return toast("Enter a positive distance", "error");
    const meters = (v * 1000) / (props.measureSystem === "imperial" ? KM_TO_MILE_FACTOR : 1);
    if (meters > maxDistance()) return toast("Can't add split: distance is longer than this activity", "error");
    const r = ranges();
    if (!r.distances.some(d => Math.abs(d - meters) < 1)) void save({ ...r, distances: [...r.distances, meters] });
    setDistanceInput("");
  };

  const addTime = () => {
    const raw = timeInput() || defaultCustomTime();
    if (!/^(?:(?:([01]?\d|2[0-3]):)?([0-5]?\d):)?([0-5]?\d)$/.test(raw)) return toast("Enter a time as hh:mm:ss", "error");
    const s = militaryToSec(raw);
    if (!(s > 0)) return;
    if (s > maxTime()) return toast("Can't add split: time is longer than this activity", "error");
    const r = ranges();
    if (!r.times.includes(s)) void save({ ...r, times: [...r.times, s] });
    setTimeInput("");
  };

  const removeRow = (row: SplitRow) => {
    const r = ranges();
    void save(
      row.type === "distance" ? { ...r, distances: r.distances.filter(d => d !== row.range) } : { ...r, times: r.times.filter(t => t !== row.range) }
    );
  };

  const printRange = (row: SplitRow) =>
    row.type === "time"
      ? secToMilitary(row.range)
      : `${DistanceSensor.DEFAULT.formatFromStat(row.range, props.measureSystem)} ${DistanceSensor.DEFAULT.displayUnit(props.measureSystem)}`;

  const isSelected = (r: Range | undefined) => !!r && props.selected?.[0] === r[0] && props.selected?.[1] === r[1];

  return (
    <Show when={sensors().length} fallback={<div class="muted pad">Best split data is unavailable on this activity.</div>}>
      <div class="table-wrap">
        <table class="data splits-table">
          <thead>
            <tr>
              <th>Distance / Time</th>
              <For each={sensors()}>{s => <th>{TITLES[s.streamKey] ?? s.name}{s.isPace ? " (pace)" : ""}</th>}</For>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={rows()} fallback={<tr><td colspan={sensors().length + 2} class="muted">No split ranges fit in this activity.</td></tr>}>
              {row => (
                <tr>
                  <td>{printRange(row)}</td>
                  <For each={sensors()}>
                    {s => {
                      const r = () => row.results.get(s.streamKey);
                      return (
                        <td>
                          <Show when={r()} fallback="-">
                            <button
                              type="button"
                              class="link-btn"
                              classList={{ selected: isSelected(r()?.indexes) }}
                              title="Show on map and graph"
                              onClick={() => props.onSelect(r()!.indexes)}
                            >
                              {printValue(s, r()!.value, props.measureSystem)}
                            </button>
                          </Show>
                        </td>
                      );
                    }}
                  </For>
                  <td class="row-actions">
                    <IconButton icon="close" label="Remove this split range" onClick={() => removeRow(row)} />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="split-form row-wrap">
        <Show when={maxDistance() > 0}>
          <label class="row">
            <span class="muted small">Distance ({props.measureSystem === "imperial" ? "mi" : "km"})</span>
            <input
              class="input split-input"
              type="number"
              min="0.1"
              step="0.1"
              placeholder={String(round(defaultCustomDistance(), 1))}
              value={distanceInput()}
              onInput={e => setDistanceInput(e.currentTarget.value)}
              onKeyDown={e => e.key === "Enter" && addDistance()}
            />
            <Button small icon="add" onClick={addDistance}>
              Add
            </Button>
          </label>
        </Show>
        <label class="row">
          <span class="muted small">Time (hh:mm:ss)</span>
          <input
            class="input split-input"
            type="text"
            placeholder={defaultCustomTime()}
            value={timeInput()}
            onInput={e => setTimeInput(e.currentTarget.value)}
            onKeyDown={e => e.key === "Enter" && addTime()}
          />
          <Button small icon="add" onClick={addTime}>
            Add
          </Button>
        </label>
        <div class="spacer" />
        <Show when={pref()}>
          <Button small variant="ghost" onClick={() => save(null)}>
            Reset ranges
          </Button>
        </Show>
      </div>
      <div class="faint small hint">Split ranges apply to every activity. Click a value to show that section on the map and graph.</div>
    </Show>
  );
}
