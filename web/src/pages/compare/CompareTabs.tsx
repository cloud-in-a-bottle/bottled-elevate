// Compare tabs: per-stat mini comparison charts (grouped like the stats panel) and overlaid peak curves.
import dayjs from "dayjs";
import { createMemo, For, Show } from "solid-js";
import Plot, { type Data, type Layout } from "../../components/Plot";
import { cssVar, theme } from "../../lib/theme";
import type { MeasureSystem, Peak, Streams } from "../../lib/types";
import { peakPoints, peaksOf, peaksXAxis, sensorYAxis } from "../activity/shared/charts";
import { sensorColor } from "../activity/shared/colors";
import { provideSensors, sensorRowTitle, type Sensor } from "../activity/shared/sensors";
import { statsGroups, type Stat, type StatsGroup } from "../activity/shared/stats";
import { statChartPoints, type ComparedWorkout } from "./compare-model";

const PEAKS_STREAMS: (keyof Streams)[] = ["watts", "heartrate", "velocity_smooth", "cadence"];

// ---- Stats ----

export function buildStatsGroupRows(workouts: ComparedWorkout[], ms: MeasureSystem): { group: StatsGroup; stats: Stat[] }[] {
  // Groups follow the earliest workout's sport; a stat is kept when any workout has a chartable value.
  if (!workouts.length) return [];
  return statsGroups(workouts[0].activity)
    .map(group => ({ group, stats: group.stats.filter(st => statChartPoints(st, workouts, ms).length > 0) }))
    .filter(g => g.stats.length);
}

function StatChart(props: { stat: Stat; workouts: ComparedWorkout[]; measureSystem: MeasureSystem }) {
  const points = createMemo(() => statChartPoints(props.stat, props.workouts, props.measureSystem));
  const unit = () => props.stat.resolveUnit(props.measureSystem);
  const data = createMemo<Data[]>(() => {
    theme();
    const p = points();
    return [
      {
        type: "scatter",
        mode: "lines+markers",
        x: p.map(pt => pt.x),
        y: p.map(pt => pt.y),
        text: p.map(pt => pt.text),
        hoverinfo: "text",
        line: { color: cssVar("--text-faint"), width: 1 },
        marker: { color: p.map(pt => pt.color), size: 10, line: { color: cssVar("--surface"), width: 2 } }
      } as Data
    ];
  });
  const layout = (): Partial<Layout> => {
    const p = points();
    const isTime = p[0]?.isTime;
    const maxSec = Math.max(...p.map(pt => Math.abs(pt.seconds ?? 0)));
    return {
      height: 150,
      margin: { l: 62, r: 12, t: 8, b: 28 },
      showlegend: false,
      hovermode: "closest",
      xaxis: {
        type: "linear",
        fixedrange: true,
        range: [-0.5, props.workouts.length - 0.5],
        tickmode: "array",
        tickvals: props.workouts.map((_, i) => i),
        ticktext: props.workouts.map(w => dayjs(w.activity.startTime).format("MMM D")),
        showgrid: false
      },
      yaxis: isTime
        ? { type: "date", fixedrange: true, tickformat: maxSec >= 3600 ? "%H:%M:%S" : "%M:%S", nticks: 4 }
        : { fixedrange: true, ticksuffix: unit() ? ` ${unit()}` : "", nticks: 4 }
    };
  };
  return (
    <div class="compare-stat-chart" title={props.stat.description ?? undefined}>
      <div class="small stat-chart-title">{props.stat.name}</div>
      <Plot data={data()} layout={layout()} style="width:100%;height:150px" />
    </div>
  );
}

export function CompareStatsTab(props: { workouts: ComparedWorkout[]; measureSystem: MeasureSystem }) {
  const groups = createMemo(() => buildStatsGroupRows(props.workouts, props.measureSystem));
  return (
    <div class="stats-groups">
      <For each={groups()} fallback={<div class="muted pad">Stats are unavailable on these activities.</div>}>
        {g => (
          <section class="stats-group stat-display-group" style={{ "border-left-color": g.group.sensor ? sensorColor(g.group.sensor) : "var(--border)" }}>
            <h3>{g.group.name}</h3>
            <div class="stat-charts-grid">
              <For each={g.stats}>{st => <StatChart stat={st} workouts={props.workouts} measureSystem={props.measureSystem} />}</For>
            </div>
          </section>
        )}
      </For>
    </div>
  );
}

// ---- Peaks ----

interface PeaksRow {
  title: string;
  sensor: Sensor;
  entries: { workout: ComparedWorkout; sensor: Sensor; peaks: Peak[] }[];
}

export function buildPeaksRows(workouts: ComparedWorkout[]): PeaksRow[] {
  const rows = new Map<string, PeaksRow>();
  for (const w of workouts) {
    for (const sensor of provideSensors(w.activity, PEAKS_STREAMS)) {
      const peaks = peaksOf(w.activity, sensor);
      if (!peaks) continue;
      const title = sensorRowTitle(sensor);
      let row = rows.get(title);
      if (!row) rows.set(title, (row = { title, sensor, entries: [] }));
      row.entries.push({ workout: w, sensor, peaks });
    }
  }
  return [...rows.values()];
}

function ComparePeakChart(props: { row: PeaksRow; measureSystem: MeasureSystem }) {
  const data = createMemo<Data[]>(() =>
    props.row.entries.map(e => {
      const p = peakPoints(e.peaks, e.sensor, props.measureSystem);
      return {
        type: "scatter",
        mode: "lines+markers",
        name: e.workout.label,
        x: p.x,
        y: p.y,
        line: { color: e.workout.color, width: 2 },
        marker: { color: e.workout.color, size: 6 },
        hovertemplate: `${props.row.sensor.isPace ? "%{y|%M:%S}" : `%{y:.${props.row.sensor.defaultRoundDecimals}f}`} ${
          props.row.sensor.displayUnit(props.measureSystem) ?? ""
        }`
      } as Data;
    })
  );
  const layout = (): Partial<Layout> => ({
    height: 360,
    margin: { l: 70, r: 16, t: 10, b: 50 },
    hovermode: "x",
    showlegend: true,
    legend: { orientation: "h", y: -0.25 },
    xaxis: peaksXAxis(),
    yaxis: { ...sensorYAxis(props.row.sensor, props.measureSystem), fixedrange: true }
  });
  return (
    <div class="chart-card compare-peak-chart">
      <h3 class="chart-title">
        {props.row.title}
        <span class="muted small"> · {props.row.sensor.displayUnit(props.measureSystem, false)}</span>
      </h3>
      <Plot data={data()} layout={layout()} style="width:100%;height:360px" />
    </div>
  );
}

export function ComparePeaksTab(props: { workouts: ComparedWorkout[]; measureSystem: MeasureSystem }) {
  const rows = createMemo(() => buildPeaksRows(props.workouts));
  return (
    <Show when={rows().length} fallback={<div class="muted pad">Peaks are unavailable on these activities.</div>}>
      <div class="charts-grid">
        <For each={rows()}>{r => <ComparePeakChart row={r} measureSystem={props.measureSystem} />}</For>
      </div>
    </Show>
  );
}
