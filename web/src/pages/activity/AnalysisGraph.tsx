// Analysis graph: one stacked chart per sensor sharing the x axis (distance or time), with
// smoothing, zoom-to-select (highlights the range on the map) and hover (moves the map cursor).
import type { PlotRelayoutEvent } from "plotly.js";
import { createMemo, createSignal, For, Show } from "solid-js";
import Plot, { type Data, type Layout } from "../../components/Plot";
import { Button, Segmented } from "../../components/ui";
import { loadLocal, saveLocal } from "../../lib/storage";
import type { Activity, MeasureSystem, Streams } from "../../lib/types";
import { scaleValues, sensorValues, sensorYAxis, xAxisLayout, type ScaleMode } from "./shared/charts";
import { sensorColor, withAlpha } from "./shared/colors";
import { provideSensors, type Sensor } from "./shared/sensors";
import { SMOOTHING_OPTIONS } from "./shared/smoothing";

const GRAPH_STREAMS: (keyof Streams)[] = ["altitude", "velocity_smooth", "heartrate", "watts", "cadence", "grade_adjusted_speed"];
const ROW_HEIGHT = 130;

export type Range = [number, number];

/** First index whose x is >= value. */
function indexAtOrAfter(xs: number[], value: number): number | null {
  for (let i = 0; i < xs.length; i++) if (xs[i] >= value) return i;
  return null;
}

/** Plotly relayout range bound (number or "1970-01-01 00:10:00.5" date string) -> number in x units. */
function toX(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v.replace(" ", "T") + (v.includes("Z") ? "" : "Z"));
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Map an x-axis zoom range to stream indexes (toZoomRangeIndexes). */
export function zoomToIndexes(xs: number[], from: number, to: number): Range | null {
  const a = indexAtOrAfter(xs, from);
  const b = indexAtOrAfter(xs, to) ?? xs.length - 1;
  if (a === null || a > b) return null;
  if (a === b) return a > 0 ? [a - 1, b] : b + 1 < xs.length ? [a, b + 1] : null;
  return [a, b];
}

export function availableSensors(a: Activity, streams: Streams): Sensor[] {
  return provideSensors(a, GRAPH_STREAMS).filter(s => (streams[s.streamKey] as number[] | undefined)?.length);
}

export default function AnalysisGraph(props: {
  activity: Activity;
  streams: Streams;
  measureSystem: MeasureSystem;
  /** Range highlighted from elsewhere (laps, splits, peaks): shaded on the graph. */
  highlight: Range | null;
  onHover: (index: number | null) => void;
  onSelect: (range: Range | null) => void;
}) {
  const hasDistance = () => !!props.streams.distance?.length;
  const [scale, setScale] = createSignal<ScaleMode>(loadLocal("activity.graphScale", "distance"));
  const effectiveScale = (): ScaleMode => (hasDistance() ? scale() : "time");
  const [smoothing, setSmoothing] = createSignal<number>(loadLocal("activity.graphSmoothing", 0));
  const [hidden, setHidden] = createSignal<string[]>(loadLocal("activity.graphHidden", []));
  const [zoomed, setZoomed] = createSignal(false);
  const [resetCount, setResetCount] = createSignal(0);

  const sensors = createMemo(() => availableSensors(props.activity, props.streams));
  const visible = createMemo(() => sensors().filter(s => !hidden().includes(s.name)));
  const xs = createMemo(() => scaleValues(props.streams, effectiveScale(), props.measureSystem) ?? []);

  const toggleSensor = (s: Sensor) => {
    const next = hidden().includes(s.name) ? hidden().filter(n => n !== s.name) : [...hidden(), s.name];
    setHidden(next);
    saveLocal("activity.graphHidden", next);
  };

  const data = createMemo<Data[]>(() => {
    const x = xs();
    return visible().map((s, i) => {
      const color = sensorColor(s);
      const fill = s.name === "Elevation";
      return {
        type: "scatter",
        mode: "lines",
        name: s.name,
        x,
        y: sensorValues(s, props.streams, smoothing(), props.measureSystem) ?? [],
        xaxis: "x",
        yaxis: i === 0 ? "y" : `y${i + 1}`,
        line: { color, width: 1.5 },
        fill: fill ? "tozeroy" : "none",
        fillcolor: fill ? withAlpha(color, 0.2) : undefined,
        connectgaps: false,
        hovertemplate: s.isPace ? `%{y|%M:%S} ${s.displayUnit(props.measureSystem)}` : undefined
      } as Data;
    });
  });

  const layout = createMemo<Partial<Layout>>(() => {
    const n = visible().length;
    const gap = n > 1 ? 0.05 : 0;
    const l: Record<string, unknown> = {
      height: Math.max(220, n * ROW_HEIGHT + 50),
      margin: { l: 80, r: 16, t: 10, b: 40 },
      showlegend: false,
      hovermode: "x",
      uirevision: `${effectiveScale()}-${resetCount()}`,
      xaxis: {
        ...xAxisLayout(effectiveScale(), props.measureSystem),
        anchor: n ? (n === 1 ? "y" : `y${n}`) : undefined,
        showspikes: true,
        spikemode: "across",
        spikesnap: "cursor",
        spikethickness: 1,
        spikedash: "solid",
        zeroline: false
      },
      shapes: []
    };
    visible().forEach((s, i) => {
      const top = 1 - i / n;
      const bottom = 1 - (i + 1) / n;
      l[i === 0 ? "yaxis" : `yaxis${i + 1}`] = {
        ...sensorYAxis(s, props.measureSystem),
        domain: [bottom + (i === n - 1 ? 0 : gap / 2), top - (i === 0 ? 0 : gap / 2)],
        fixedrange: true,
        title: { text: s.name, font: { color: sensorColor(s), size: 11 } },
        tickfont: { size: 10 },
        nticks: 4
      };
    });
    const h = props.highlight;
    const x = xs();
    if (h && x[h[0]] !== undefined && x[h[1]] !== undefined) {
      l.shapes = [
        {
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: x[h[0]],
          x1: x[h[1]],
          y0: 0,
          y1: 1,
          fillcolor: "rgba(255,215,64,0.18)",
          line: { width: 0 },
          layer: "below"
        }
      ];
    }
    return l as Partial<Layout>;
  });

  const onRelayout = (e: PlotRelayoutEvent) => {
    const ev = e as Record<string, unknown>;
    if (ev["xaxis.autorange"]) {
      setZoomed(false);
      props.onSelect(null);
      return;
    }
    const from = toX(ev["xaxis.range[0]"] ?? (ev["xaxis.range"] as unknown[] | undefined)?.[0]);
    const to = toX(ev["xaxis.range[1]"] ?? (ev["xaxis.range"] as unknown[] | undefined)?.[1]);
    if (from === null || to === null) return;
    setZoomed(true);
    props.onSelect(zoomToIndexes(xs(), from, to));
  };

  const resetZoom = () => {
    setResetCount(resetCount() + 1);
    setZoomed(false);
    props.onSelect(null);
  };

  return (
    <div class="analysis-graph">
      <div class="graph-toolbar row-wrap">
        <div class="row-wrap sensor-toggles">
          <For each={sensors()}>
            {s => (
              <button
                type="button"
                class="sensor-chip"
                classList={{ off: hidden().includes(s.name) }}
                aria-pressed={!hidden().includes(s.name)}
                title={hidden().includes(s.name) ? `Show ${s.name}` : `Hide ${s.name}`}
                onClick={() => toggleSensor(s)}
              >
                <span class="dot" style={{ background: sensorColor(s) }} />
                {s.name}
              </button>
            )}
          </For>
        </div>
        <div class="spacer" />
        <Show when={zoomed()}>
          <Button small onClick={resetZoom}>
            Zoom out
          </Button>
        </Show>
        <span class="muted small">Smoothing</span>
        <Segmented
          class="smoothing-toggle"
          options={SMOOTHING_OPTIONS.map(o => ({ value: o.windowSeconds, label: o.label }))}
          value={smoothing()}
          onChange={v => {
            setSmoothing(v);
            saveLocal("activity.graphSmoothing", v);
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
              saveLocal("activity.graphScale", v);
              setZoomed(false);
              props.onSelect(null);
            }}
          />
        </Show>
      </div>
      <Show when={visible().length} fallback={<div class="muted small pad">All sensors hidden.</div>}>
        <Plot
          data={data()}
          layout={layout()}
          style={`width:100%;height:${Math.max(220, visible().length * ROW_HEIGHT + 50)}px`}
          onHover={e => props.onHover(e.points[0]?.pointIndex ?? null)}
          onUnhover={() => props.onHover(null)}
          onRelayout={onRelayout}
        />
        <div class="faint small hint">Drag horizontally on the graph to select a section and show it on the map; double-click to reset.</div>
      </Show>
    </div>
  );
}
