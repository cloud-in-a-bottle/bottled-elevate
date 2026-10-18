// Peaks (best effort per duration) and time-in-zones charts, one per sensor.
import { createMemo, For, Show } from "solid-js";
import Plot, { type Data, type Layout } from "../../components/Plot";
import { round } from "../../lib/format";
import type { Activity, MeasureSystem, Peak, Streams } from "../../lib/types";
import { peakPoints, peaksOf, peaksXAxis, secToDateMs, sensorYAxis, zoneLabel, zonesOf } from "./shared/charts";
import { sensorColor, withAlpha } from "./shared/colors";
import { provideSensors, type Sensor } from "./shared/sensors";
import type { Range } from "./AnalysisGraph";

const PEAKS_STREAMS: (keyof Streams)[] = ["watts", "heartrate", "velocity_smooth", "cadence"];
const ZONES_STREAMS: (keyof Streams)[] = ["watts", "heartrate", "velocity_smooth", "cadence", "grade_smooth", "altitude"];

export function peakSensors(a: Activity): { sensor: Sensor; peaks: Peak[] }[] {
  return provideSensors(a, PEAKS_STREAMS)
    .map(sensor => ({ sensor, peaks: peaksOf(a, sensor) }))
    .filter((r): r is { sensor: Sensor; peaks: Peak[] } => !!r.peaks);
}

function ChartTitle(props: { sensor: Sensor; measureSystem: MeasureSystem }) {
  return (
    <h3 class="chart-title">
      <span class="dot" style={{ background: sensorColor(props.sensor) }} />
      {props.sensor.name}
      <span class="muted small"> · {props.sensor.displayUnit(props.measureSystem, false)}</span>
    </h3>
  );
}

function PeakChart(props: { sensor: Sensor; peaks: Peak[]; measureSystem: MeasureSystem; onSelect: (r: Range) => void }) {
  const data = createMemo<Data[]>(() => {
    const p = peakPoints(props.peaks, props.sensor, props.measureSystem);
    const color = sensorColor(props.sensor);
    return [
      {
        type: "scatter",
        mode: "lines+markers",
        name: props.sensor.name,
        x: p.x,
        y: p.y,
        line: { color, width: 2 },
        marker: { color, size: 8 },
        hovertemplate: props.sensor.isPace
          ? `%{y|%M:%S} ${props.sensor.displayUnit(props.measureSystem)}<extra>%{x}s</extra>`
          : `%{y:.${props.sensor.defaultRoundDecimals}f} ${props.sensor.displayUnit(props.measureSystem)}<extra>%{x}s</extra>`
      } as Data
    ];
  });
  const layout = (): Partial<Layout> => ({
    height: 280,
    margin: { l: 70, r: 16, t: 10, b: 50 },
    hovermode: "closest",
    showlegend: false,
    xaxis: peaksXAxis(),
    yaxis: { ...sensorYAxis(props.sensor, props.measureSystem), fixedrange: true }
  });
  return (
    <div class="chart-card">
      <ChartTitle sensor={props.sensor} measureSystem={props.measureSystem} />
      <Plot
        data={data()}
        layout={layout()}
        style="width:100%;height:280px"
        onClick={e => {
          const range = e.points[0]?.x;
          const peak = props.peaks.find(p => p.range === range);
          if (peak) props.onSelect([peak.start, peak.end]);
        }}
      />
    </div>
  );
}

export function PeaksTab(props: { activity: Activity; measureSystem: MeasureSystem; hasMap: boolean; onSelect: (r: Range) => void }) {
  const rows = createMemo(() => peakSensors(props.activity));
  return (
    <Show when={rows().length} fallback={<div class="muted pad">Peaks data is unavailable on this activity.</div>}>
      <div class="charts-grid">
        <For each={rows()}>
          {r => <PeakChart sensor={r.sensor} peaks={r.peaks} measureSystem={props.measureSystem} onSelect={props.onSelect} />}
        </For>
      </div>
      <Show when={props.hasMap}>
        <div class="faint small hint">Click a point to show where that peak happened on the map.</div>
      </Show>
    </Show>
  );
}

function ZonesChart(props: { sensor: Sensor; activity: Activity; measureSystem: MeasureSystem }) {
  // Leading/trailing empty zones are trimmed (long zone lists otherwise drown the bars).
  const indexed = createMemo(() => {
    const all = (zonesOf(props.activity, props.sensor) ?? []).map((zone, index) => ({ zone, index }));
    let a = 0;
    let b = all.length - 1;
    while (a < b && all[a].zone.s <= 0) a++;
    while (b > a && all[b].zone.s <= 0) b--;
    return all.slice(a, b + 1);
  });
  const zones = () => indexed().map(z => z.zone);
  const label = (i: number) => zoneLabel(indexed()[i].zone, indexed()[i].index, props.sensor, props.measureSystem);
  const data = createMemo<Data[]>(() => {
    const color = sensorColor(props.sensor);
    const z = zones();
    return [
      {
        type: "bar",
        x: z.map((_, i) => i),
        y: z.map(zone => secToDateMs(Math.max(0, zone.s))),
        text: z.map(zone => `${round(zone.percent ?? 0, 1)}%`),
        customdata: z.map((_, i) => label(i)),
        hovertemplate: "%{customdata}<br>%{y|%H:%M:%S} · %{text}<extra></extra>",
        textposition: "none",
        marker: { color: withAlpha(color, 0.55), line: { color, width: 1.25 } }
      } as Data
    ];
  });
  const layout = (): Partial<Layout> => {
    const z = zones();
    return {
      height: 300,
      margin: { l: 80, r: 16, t: 10, b: 110 },
      showlegend: false,
      bargap: 0.15,
      xaxis: {
        fixedrange: true,
        tickmode: "array",
        tickvals: z.map((_, i) => i),
        ticktext: z.map((_, i) => label(i)),
        tickangle: -45,
        autorange: props.sensor.isPace ? "reversed" : true
      },
      yaxis: {
        fixedrange: true,
        type: "date",
        tickformat: "%H:%M:%S",
        range: [0, secToDateMs(Math.max(60, ...z.map(zone => zone.s)) * 1.08)],
        title: { text: "Time" }
      }
    };
  };
  return (
    <div class="chart-card">
      <ChartTitle sensor={props.sensor} measureSystem={props.measureSystem} />
      <Plot data={data()} layout={layout()} style="width:100%;height:300px" />
    </div>
  );
}

export function ZonesTab(props: { activity: Activity; measureSystem: MeasureSystem }) {
  const sensors = createMemo(() => provideSensors(props.activity, ZONES_STREAMS).filter(s => zonesOf(props.activity, s)));
  return (
    <Show when={sensors().length} fallback={<div class="muted pad">Time in zones is unavailable on this activity.</div>}>
      <div class="charts-grid">
        <For each={sensors()}>{s => <ZonesChart sensor={s} activity={props.activity} measureSystem={props.measureSystem} />}</For>
      </div>
      <div class="faint small hint">
        Zones are configured in <a href="#/zones">Zones Settings</a>.
      </div>
    </Show>
  );
}
