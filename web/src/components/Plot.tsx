import Plotly from "plotly.js-basic-dist-min";
import type { Config, Data, Layout, PlotlyHTMLElement } from "plotly.js";
import { createEffect, onCleanup, onMount } from "solid-js";
import { cssVar, theme } from "../lib/theme";

export type { Data, Layout } from "plotly.js";

export interface PlotProps {
  data: Data[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  class?: string;
  style?: string;
  /** Called with the plot element after each render (eg to bind plotly_click). */
  onReady?: (el: PlotlyHTMLElement) => void;
  onClick?: (event: Plotly.PlotMouseEvent) => void;
  onHover?: (event: Plotly.PlotHoverEvent) => void;
  onUnhover?: () => void;
  onRelayout?: (event: Plotly.PlotRelayoutEvent) => void;
}

/** Theme-aware base layout: transparent background, app font and colors. */
export function baseLayout(): Partial<Layout> {
  const text = cssVar("--text-muted");
  const grid = cssVar("--grid");
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, system-ui, sans-serif", size: 12, color: text },
    margin: { l: 50, r: 20, t: 20, b: 40 },
    xaxis: { gridcolor: grid, zerolinecolor: grid, linecolor: grid },
    yaxis: { gridcolor: grid, zerolinecolor: grid, linecolor: grid },
    hoverlabel: { bgcolor: cssVar("--surface-raised"), bordercolor: grid, font: { color: cssVar("--text") } },
    legend: { orientation: "h" }
  };
}

function merge(base: any, extra: any): any {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" ? merge(base[k], v) : v;
  }
  return out;
}

/** A Plotly chart that re-renders when its data, layout or the theme changes. */
export default function Plot(props: PlotProps) {
  let el!: HTMLDivElement;
  let bound = false;

  const render = () => {
    theme(); // re-render on theme change
    const base = baseLayout();
    const layout = merge(base, { autosize: true, ...props.layout });
    // Extra axes of stacked/multi-axis charts (xaxis2, yaxis3, ...) get the themed axis style too.
    for (const key of Object.keys(layout)) {
      const m = /^([xy])axis\d+$/.exec(key);
      if (m) layout[key] = merge(base[`${m[1]}axis` as "xaxis"], layout[key]);
    }
    const config: Partial<Config> = { displaylogo: false, responsive: true, displayModeBar: false, ...props.config };
    Plotly.react(el, props.data, layout, config).then(gd => {
      if (!bound) {
        bound = true;
        if (props.onClick) gd.on("plotly_click", e => props.onClick?.(e));
        if (props.onHover) gd.on("plotly_hover", e => props.onHover?.(e));
        if (props.onUnhover) gd.on("plotly_unhover", () => props.onUnhover?.());
        if (props.onRelayout) gd.on("plotly_relayout", e => props.onRelayout?.(e));
      }
      props.onReady?.(gd);
    });
  };

  onMount(() => {
    createEffect(render);
    const ro = new ResizeObserver(() => {
      if (el.offsetParent !== null) Plotly.Plots.resize(el);
    });
    ro.observe(el);
    onCleanup(() => {
      ro.disconnect();
      Plotly.purge(el);
    });
  });

  return <div ref={el} class={props.class} style={props.style ?? "width:100%;height:300px"} />;
}
