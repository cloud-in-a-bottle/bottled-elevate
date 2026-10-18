// Stacked analysis graphs: one chart row per sensor, one trace per workout, sharing the x axis.
import { createMemo, createSignal, Show } from "solid-js";
import Plot, { type Data, type Layout } from "../../components/Plot";
import { Segmented } from "../../components/ui";
import { loadLocal, saveLocal } from "../../lib/storage";
import type { MeasureSystem, Streams } from "../../lib/types";
import { scaleValues, sensorValues, sensorYAxis, xAxisLayout, type ScaleMode } from "../activity/shared/charts";
import { provideSensors, sensorRowTitle, type Sensor } from "../activity/shared/sensors";
import { SMOOTHING_OPTIONS } from "../activity/shared/smoothing";
import type { ComparedWorkout } from "./compare-model";

const GRAPH_STREAMS: (keyof Streams)[] = ["altitude", "velocity_smooth", "heartrate", "watts", "cadence", "grade_adjusted_speed"];
const ROW_HEIGHT = 170;

export interface CompareRow {
  title: string;
  /** Sensor of the first workout having the row (units and axis). */
  sensor: Sensor;
  entries: { workout: ComparedWorkout; sensor: Sensor }[];
}

/** Rows by sensor title ("Power" and "Est. Power" merge), in sensor order of first appearance. */
export function buildGraphRows(workouts: ComparedWorkout[]): CompareRow[] {
  const rows = new Map<string, CompareRow>();
  for (const w of workouts) {
    if (!w.streams) continue;
    for (const sensor of provideSensors(w.activity, GRAPH_STREAMS)) {
      if (!(w.streams[sensor.streamKey] as number[] | undefined)?.length) continue;
      const title = sensorRowTitle(sensor);
      let row = rows.get(title);
      if (!row) rows.set(title, (row = { title, sensor, entries: [] }));
      row.entries.push({ workout: w, sensor });
    }
  }
  return [...rows.values()];
}

export default function CompareGraphs(props: { workouts: ComparedWorkout[]; measureSystem: MeasureSystem }) {
  const rows = createMemo(() => buildGraphRows(props.workouts));
  const streamed = () => props.workouts.filter(w => w.streams);
  const hasDistance = () => streamed().length > 0 && streamed().every(w => w.streams!.distance?.length);
  const [scale, setScale] = createSignal<ScaleMode>(loadLocal("compare.graphScale", "distance"));
  const effectiveScale = (): ScaleMode => (hasDistance() ? scale() : "time");
  const [smoothing, setSmoothing] = createSignal<number>(loadLocal("compare.graphSmoothing", 0));

  const data = createMemo<Data[]>(() => {
    const out: Data[] = [];
    rows().forEach((row, i) => {
      for (const e of row.entries) {
        const streams = e.workout.streams!;
        const x = scaleValues(streams, effectiveScale(), props.measureSystem);
        const y = sensorValues(e.sensor, streams, smoothing(), props.measureSystem);
        if (!x || !y) continue;
        out.push({
          type: "scatter",
          mode: "lines",
          name: e.workout.label,
          legendgroup: e.workout.activity.id,
          showlegend: false,
          x,
          y,
          xaxis: "x",
          yaxis: i === 0 ? "y" : `y${i + 1}`,
          line: { color: e.workout.color, width: 1.5 },
          connectgaps: false,
          hovertemplate: `${row.title}: ${row.sensor.isPace ? "%{y|%M:%S}" : `%{y:.${row.sensor.defaultRoundDecimals}f}`} ${
            row.sensor.displayUnit(props.measureSystem) ?? ""
          }`
        } as Data);
      }
    });
    return out;
  });

  const height = () => Math.max(240, rows().length * ROW_HEIGHT + 50);

  const layout = createMemo<Partial<Layout>>(() => {
    const n = rows().length;
    const gap = n > 1 ? 0.05 : 0;
    const l: Record<string, unknown> = {
      height: height(),
      margin: { l: 80, r: 16, t: 10, b: 40 },
      showlegend: false,
      hovermode: "x",
      uirevision: effectiveScale(),
      xaxis: {
        ...xAxisLayout(effectiveScale(), props.measureSystem),
        anchor: n > 1 ? `y${n}` : "y",
        showspikes: true,
        spikemode: "across",
        spikesnap: "cursor",
        spikethickness: 1,
        spikedash: "solid",
        zeroline: false
      }
    };
    rows().forEach((row, i) => {
      l[i === 0 ? "yaxis" : `yaxis${i + 1}`] = {
        ...sensorYAxis(row.sensor, props.measureSystem),
        domain: [1 - (i + 1) / n + (i === n - 1 ? 0 : gap / 2), 1 - i / n - (i === 0 ? 0 : gap / 2)],
        fixedrange: true,
        title: { text: row.title, font: { size: 11 } },
        tickfont: { size: 10 },
        nticks: 5
      };
    });
    return l as Partial<Layout>;
  });

  return (
    <Show when={rows().length}>
      <div class="graphs-stack">
        <div class="graph-toolbar row-wrap">
          <span class="muted small">Drag to zoom, double-click to reset.</span>
          <div class="spacer" />
          <span class="muted small">Smoothing</span>
          <Segmented
            class="smoothing-toggle"
            options={SMOOTHING_OPTIONS.map(o => ({ value: o.windowSeconds, label: o.label }))}
            value={smoothing()}
            onChange={v => {
              setSmoothing(v);
              saveLocal("compare.graphSmoothing", v);
            }}
          />
          <Show when={hasDistance()}>
            <Segmented
              class="scale-toggle"
              options={[
                { value: "distance" as ScaleMode, label: "Distance" },
                { value: "time" as ScaleMode, label: "Time" }
              ]}
              value={effectiveScale()}
              onChange={v => {
                setScale(v);
                saveLocal("compare.graphScale", v);
              }}
            />
          </Show>
        </div>
        <Plot data={data()} layout={layout()} class="compare-graph" style={`width:100%;height:${height()}px`} />
      </div>
    </Show>
  );
}
