// Fitness / fatigue / form chart (was metrics-graphics): form area, dashed preview days,
// training zone bands, today marker, active-day dots, unified hover with day details.
import dayjs from "dayjs";
import { createMemo } from "solid-js";
import type { Annotations, Shape } from "plotly.js";
import Plot, { type Data, type Layout } from "../../components/Plot";
import { IconButton } from "../../components/ui";
import { cssVar, theme } from "../../lib/theme";
import {
  DATE_FORMAT,
  floorTo,
  hasActivities,
  printDeltaFatigue,
  printDeltaFitness,
  printDeltaForm,
  printScore,
  printTypesCount,
  TRAINING_ZONE_THRESHOLDS,
  trainingZoneName,
  type DayFitnessTrend
} from "./fitness";
import { canBackward, canForward, canZoomIn, canZoomOut, indexesOf, type Period } from "./periods";

export interface GraphProps {
  trend: DayFitnessTrend[];
  period: Period;
  dateMin: string;
  dateMax: string;
  zonesEnabled: boolean;
  onPeriodNav: (action: "forward" | "backward" | "zoomIn" | "zoomOut") => void;
  onViewDay: (day: DayFitnessTrend | null) => void;
  onOpenDay: (day: DayFitnessTrend) => void;
}

function rgba(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const ZONE_BANDS: { name: string; from: number; to: number; color: string }[] = [
  { name: "Transition", from: TRAINING_ZONE_THRESHOLDS.FRESHNESS, to: Infinity, color: "--text-faint" },
  { name: "Freshness", from: TRAINING_ZONE_THRESHOLDS.NEUTRAL, to: TRAINING_ZONE_THRESHOLDS.FRESHNESS, color: "--info" },
  { name: "Neutral", from: TRAINING_ZONE_THRESHOLDS.OPTIMAL, to: TRAINING_ZONE_THRESHOLDS.NEUTRAL, color: "--text-muted" },
  { name: "Optimal", from: TRAINING_ZONE_THRESHOLDS.OVERLOAD, to: TRAINING_ZONE_THRESHOLDS.OPTIMAL, color: "--success" },
  { name: "Overload", from: -Infinity, to: TRAINING_ZONE_THRESHOLDS.OVERLOAD, color: "--danger" }
];

function hoverText(d: DayFitnessTrend, zonesEnabled: boolean): string {
  const delta = (s: string | null) => (s ? ` <span style="font-size:11px">(${s})</span>` : "");
  const lines: string[] = [];
  if (hasActivities(d)) {
    lines.push(`<b>${printTypesCount(d.types, 2, "-")}</b>  · click to open`);
    lines.push(`Stress score <b>${printScore(d.finalStressScore)}</b>`);
  } else {
    lines.push(`<i>${d.previewDay ? "Preview day" : "Rest day"}</i>`);
  }
  lines.push(`Fitness <b>${floorTo(d.ctl, 1)}</b>${delta(printDeltaFitness(d))}`);
  lines.push(`Fatigue <b>${floorTo(d.atl, 1)}</b>${delta(printDeltaFatigue(d))}`);
  lines.push(
    `Form <b>${floorTo(d.tsb, 1)}</b>${delta(printDeltaForm(d))}${zonesEnabled ? ` → ${trainingZoneName(d.trainingZone)}` : ""}`
  );
  return lines.join("<br>");
}

export default function FitnessTrendGraph(props: GraphProps) {
  const visible = createMemo(() => {
    const { start, end } = indexesOf(props.trend, props.period);
    return props.trend.slice(start, end + 1);
  });

  const chart = createMemo(() => {
    theme(); // recolor on theme change
    const days = visible();
    const zones = props.zonesEnabled;
    const today = dayjs().format(DATE_FORMAT);
    const cFitness = cssVar("--c-fitness");
    const cFatigue = cssVar("--c-fatigue");
    const cForm = cssVar("--c-form");

    const real = days.filter(d => !d.previewDay);
    const preview = days.filter(d => d.previewDay || d.dateString === today);
    const xs = (list: DayFitnessTrend[]) => list.map(d => d.dateString);

    const line = (list: DayFitnessTrend[], key: "ctl" | "atl" | "tsb", name: string, color: string, isPreview: boolean): Data => ({
      type: "scatter",
      mode: "lines",
      name,
      x: xs(list),
      y: list.map(d => d[key]),
      line: { color, width: key === "tsb" ? 1.5 : 2.5, dash: isPreview ? "dash" : "solid" },
      fill: key === "tsb" ? "tozeroy" : "none",
      fillcolor: key === "tsb" ? rgba(cForm, isPreview ? 0.1 : 0.28) : undefined,
      hoverinfo: "skip",
      showlegend: !isPreview,
      legendgroup: name
    });

    const active = days.filter(hasActivities);
    const data: Data[] = [
      line(real, "tsb", "Form", cForm, false),
      line(preview, "tsb", "Form", cForm, true),
      line(real, "atl", "Fatigue", cFatigue, false),
      line(preview, "atl", "Fatigue", cFatigue, true),
      line(real, "ctl", "Fitness", cFitness, false),
      line(preview, "ctl", "Fitness", cFitness, true),
      {
        type: "scatter",
        mode: "markers",
        name: "Active day",
        x: xs(active),
        y: active.map(() => 0),
        marker: { color: cssVar("--text-muted"), size: 6, line: { width: 1, color: cssVar("--surface") } },
        hoverinfo: "skip",
        showlegend: false
      },
      {
        // Invisible carrier for the unified hover box.
        type: "scatter",
        mode: "markers",
        x: xs(days),
        y: days.map(d => d.ctl),
        marker: { opacity: 0, size: 1 },
        hovertemplate: days.map(d => hoverText(d, zones) + "<extra></extra>"),
        showlegend: false
      }
    ];

    // Y range: data, 0 and (with zones) the zone thresholds.
    const values = days.flatMap(d => [d.ctl, d.atl, d.tsb]);
    let yMin = Math.min(0, ...values);
    let yMax = Math.max(0, ...values);
    if (zones) {
      yMin = Math.min(yMin, TRAINING_ZONE_THRESHOLDS.OVERLOAD - 8);
      yMax = Math.max(yMax, TRAINING_ZONE_THRESHOLDS.FRESHNESS + 8);
    }
    const pad = (yMax - yMin) * 0.05 || 1;
    yMin -= pad;
    yMax += pad;

    const shapes: Partial<Shape>[] = [];
    const annotations: Partial<Annotations>[] = [];
    if (zones) {
      for (const band of ZONE_BANDS) {
        const y0 = Math.max(band.from, yMin);
        const y1 = Math.min(band.to, yMax);
        if (y1 <= y0) continue;
        const color = cssVar(band.color);
        shapes.push({ type: "rect", xref: "paper", x0: 0, x1: 1, y0, y1, fillcolor: rgba(color, 0.07), line: { width: 0 }, layer: "below" });
        if (Number.isFinite(band.from) && band.from > yMin)
          shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: band.from, y1: band.from, line: { color: rgba(color, 0.55), width: 1, dash: "dot" }, layer: "below" });
        annotations.push({
          xref: "paper", x: 1, xanchor: "right", y: (y0 + y1) / 2, yanchor: "middle", text: band.name,
          showarrow: false, font: { size: 11, color: rgba(color, 0.9) }
        });
      }
    }
    if (days.some(d => d.dateString === today)) {
      const c = cssVar("--accent");
      shapes.push({ type: "line", x0: today, x1: today, yref: "paper", y0: 0, y1: 1, line: { color: c, width: 1, dash: "dash" } });
      const atEnd = days[days.length - 1].dateString === today;
      annotations.push({ x: today, xanchor: atEnd ? "right" : "center", yref: "paper", y: 1, yanchor: "bottom", text: "Today", showarrow: false, font: { size: 11, color: c } });
    }

    const layout: Partial<Layout> = {
      margin: { l: 40, r: 10, t: 24, b: 36 },
      hovermode: "x unified",
      showlegend: true,
      legend: { orientation: "h", x: 0, y: 1.06, yanchor: "bottom", traceorder: "reversed" },
      xaxis: {
        type: "date",
        range: days.length ? [days[0].dateString, days[days.length - 1].dateString] : undefined,
        hoverformat: "%a, %b %-d %Y",
        showspikes: true,
        spikemode: "across",
        spikethickness: -2, // negative: no contrasting outline
        spikedash: "solid",
        spikecolor: cssVar("--text-faint"),
        fixedrange: true
      },
      yaxis: { range: [yMin, yMax], fixedrange: true, zeroline: true },
      shapes,
      annotations
    };
    return { data, layout };
  });

  const dayAt = (x: unknown) => {
    const key = dayjs(String(x)).format(DATE_FORMAT);
    return props.trend.find(d => d.dateString === key) ?? null;
  };

  return (
    <div class="ft-graph">
      <div class="ft-graph-nav">
        <IconButton icon="add" label="Zoom in (Up key)" disabled={!canZoomIn(props.period)} onClick={() => props.onPeriodNav("zoomIn")} />
        <IconButton icon="remove" label="Zoom out (Down key)" disabled={!canZoomOut(props.period, props.dateMin)} onClick={() => props.onPeriodNav("zoomOut")} />
        <span class="spacer" />
        <IconButton icon="chevronLeft" label="Move backward (Left key)" disabled={!canBackward(props.period, props.dateMin)} onClick={() => props.onPeriodNav("backward")} />
        <IconButton icon="chevronRight" label="Move forward (Right key)" disabled={!canForward(props.period, props.dateMax)} onClick={() => props.onPeriodNav("forward")} />
      </div>
      <Plot
        data={chart().data}
        layout={chart().layout}
        style="width:100%;height:clamp(320px, 58vh, 620px)"
        onHover={e => props.onViewDay(dayAt(e.points[0]?.x))}
        onUnhover={() => props.onViewDay(null)}
        onClick={e => {
          const day = dayAt(e.points[0]?.x);
          if (day && hasActivities(day)) props.onOpenDay(day);
        }}
      />
    </div>
  );
}
