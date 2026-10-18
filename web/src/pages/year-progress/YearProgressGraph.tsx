// One cumulative line per selected year over a shared Jan -> Dec axis, plus the optional target line.
import dayjs from "dayjs";
import { createMemo } from "solid-js";
import Plot, { type Data, type Layout } from "../../components/Plot";
import { cssVar, theme } from "../../lib/theme";
import { ProgressType, TargetProgressModel, YearProgressModel, YearProgressTypeModel } from "./models";
import { formatProgressValue } from "./format";
import { dayOfYear, valueOf } from "./yearProgress";

/** Every year is drawn on this (leap) reference year so lines align by calendar day. */
const REF_YEAR = 2000;

const pad = (n: number) => String(n).padStart(2, "0");
const refX = (year: number, dayOfYear: number) => {
  const d = new Date(year, 0, dayOfYear);
  return `${REF_YEAR}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Plotly x value ("2000-03-05" or "2000-03-05 00:00") back to a date in `year`, Feb 29 clamped. */
export function fromRefX(x: unknown, year: number): Date | null {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(x));
  if (!m) return null;
  const month = Number(m[1]) - 1;
  const day = Math.min(Number(m[2]), new Date(year, month + 1, 0).getDate());
  return new Date(year, month, day);
}

export default function YearProgressGraph(props: {
  yearProgressions: YearProgressModel[];
  selectedYears: number[];
  progressType: YearProgressTypeModel;
  colors: Map<number, string>;
  targets: TargetProgressModel[] | null;
  marker: Date;
  currentYear: number;
  height: number;
  onHover: (date: Date) => void;
  onUnhover: () => void;
  onClick: (date: Date) => void;
}) {
  const traces = createMemo<Data[]>(() => {
    const type = props.progressType;
    const selected = new Set(props.selectedYears);
    const data: Data[] = [];

    if (props.targets) {
      theme();
      data.push({
        type: "scatter",
        mode: "lines",
        name: "Target",
        x: props.targets.map(t => refX(props.currentYear, t.dayOfYear)),
        y: props.targets.map(t => t.value),
        customdata: props.targets.map(t => formatProgressValue(type.type === ProgressType.TIME ? t.value : Math.round(t.value), type)),
        hovertemplate: "Target: %{customdata}<extra></extra>",
        line: { color: cssVar("--text-faint"), width: 2, dash: "dash" }
      });
    }

    // Oldest first so the current year is drawn on top
    for (const yp of props.yearProgressions) {
      if (!selected.has(yp.year)) continue;
      const points = yp.progressions.filter(p => !p.isFuture);
      const isCurrent = yp.year === props.currentYear;
      data.push({
        type: "scatter",
        mode: "lines",
        name: String(yp.year),
        x: points.map(p => refX(yp.year, p.dayOfYear)),
        y: points.map(p => valueOf(p, type.type)),
        customdata: points.map(p => formatProgressValue(valueOf(p, type.type), type)),
        hovertemplate: `${yp.year}: %{customdata}<extra></extra>`,
        line: { color: props.colors.get(yp.year), width: isCurrent ? 3.5 : 1.75, shape: "linear" },
        opacity: isCurrent ? 1 : 0.85
      });
    }
    return data;
  });

  const layout = createMemo<Partial<Layout>>(() => {
    theme();
    const markerX = refX(props.marker.getFullYear(), dayOfYear(props.marker));
    return {
      hovermode: "x unified",
      showlegend: false,
      margin: { l: 60, r: 16, t: 24, b: 36 },
      xaxis: {
        type: "date",
        range: [`${REF_YEAR}-01-01`, `${REF_YEAR}-12-31`],
        tickformat: "%b",
        hoverformat: "%B %-d",
        dtick: "M1",
        fixedrange: true
      },
      yaxis: {
        title: { text: props.progressType.unit ? props.progressType.unit : "activities" },
        rangemode: "tozero",
        fixedrange: true
      },
      shapes: [
        {
          type: "line",
          xref: "x",
          yref: "paper",
          x0: markerX,
          x1: markerX,
          y0: 0,
          y1: 1,
          line: { color: cssVar("--accent"), width: 1.5, dash: "dot" }
        }
      ],
      annotations: [
        {
          xref: "x",
          yref: "paper",
          x: markerX,
          y: 1,
          yanchor: "bottom",
          showarrow: false,
          text: dayjs(props.marker).format("MMM D"),
          font: { color: cssVar("--accent"), size: 11 }
        }
      ]
    };
  });

  const pointDate = (e: { points: { x?: unknown }[] }) => (e.points?.length ? fromRefX(e.points[0].x, props.currentYear) : null);

  return (
    <Plot
      data={traces()}
      layout={layout()}
      style={`width:100%;height:${props.height}px`}
      onHover={e => {
        const d = pointDate(e as any);
        if (d) props.onHover(d);
      }}
      onUnhover={() => props.onUnhover()}
      onClick={e => {
        const d = pointDate(e as any);
        if (d) props.onClick(d);
      }}
    />
  );
}
