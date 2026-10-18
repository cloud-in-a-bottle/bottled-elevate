// Day-by-day fitness analysis table: filter, sort, paginate, CSV export.
import { A } from "@solidjs/router";
import dayjs from "dayjs";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { Button, IconButton } from "../../components/ui";
import {
  floorTo,
  printAthleteSettings,
  printScore,
  trainingZoneName,
  type DayFitnessTrend,
  type FitnessTrendConfig
} from "./fitness";

interface Column {
  id: string;
  header: string;
  description?: string;
  sort?: (d: DayFitnessTrend) => number | string | null;
  cell: (d: DayFitnessTrend) => JSX.Element;
  csv?: (d: DayFitnessTrend) => string | number;
}

const score = (v: number | null) => (v ? floorTo(v, 2) : "");

export interface TableProps {
  trend: DayFitnessTrend[];
  config: FitnessTrendConfig;
  zonesEnabled: boolean;
  powerMeterEnabled: boolean;
  swimEnabled: boolean;
  onShowSettings: (d: DayFitnessTrend) => void;
}

export default function FitnessTrendTable(props: TableProps) {
  const [search, setSearch] = createSignal("");
  const [sortBy, setSortBy] = createSignal<{ id: string; desc: boolean }>({ id: "date", desc: true });
  const [page, setPage] = createSignal(0);
  const [pageSize, setPageSize] = createSignal(10);

  const allColumns: Column[] = [
    { id: "date", header: "Date", sort: d => d.timestamp, cell: d => dayjs(d.date).format("ddd, MMM DD, YYYY"), csv: d => d.dateString },
    { id: "types", header: "Types", sort: d => d.types.join("; "), cell: d => d.types.join("; ") || "-", csv: d => d.types.join("; ") },
    {
      id: "activities",
      header: "Activities",
      sort: d => d.activitiesName.join("; "),
      cell: d => (
        <Show when={d.ids.length} fallback="-">
          <span class="ft-links">
            <For each={d.ids}>
              {(id, i) => <A href={`/activity/${encodeURIComponent(id)}`}>{d.activitiesName[i()]}</A>}
            </For>
          </span>
        </Show>
      ),
      csv: d => d.activitiesName.join("; ")
    },
    { id: "heartRateStressScore", header: "HRSS", description: "Heart Rate Stress Score", sort: d => d.heartRateStressScore, cell: d => printScore(d.heartRateStressScore), csv: d => score(d.heartRateStressScore) },
    { id: "trainingImpulseScore", header: "TRIMP", description: "Training Impulse", sort: d => d.trainingImpulseScore, cell: d => printScore(d.trainingImpulseScore), csv: d => score(d.trainingImpulseScore) },
    { id: "powerStressScore", header: "PSS", description: "Power Stress Score", sort: d => d.powerStressScore, cell: d => printScore(d.powerStressScore), csv: d => score(d.powerStressScore) },
    { id: "runningStressScore", header: "RSS", description: "Running Stress Score", sort: d => d.runningStressScore, cell: d => printScore(d.runningStressScore), csv: d => score(d.runningStressScore) },
    { id: "swimStressScore", header: "SwimSS", description: "Swim Stress Score", sort: d => d.swimStressScore, cell: d => printScore(d.swimStressScore), csv: d => score(d.swimStressScore) },
    { id: "finalStressScore", header: "Final stress", description: "Stress score used by the trend", sort: d => d.finalStressScore, cell: d => printScore(d.finalStressScore), csv: d => score(d.finalStressScore) },
    { id: "ctl", header: "Fitness", sort: d => d.ctl, cell: d => <span class="ctl">{floorTo(d.ctl, 1)}</span>, csv: d => floorTo(d.ctl, 2) },
    { id: "atl", header: "Fatigue", sort: d => d.atl, cell: d => <span class="atl">{floorTo(d.atl, 1)}</span>, csv: d => floorTo(d.atl, 2) },
    { id: "tsb", header: "Form", sort: d => d.tsb, cell: d => <span class="tsb">{floorTo(d.tsb, 1)}</span>, csv: d => floorTo(d.tsb, 2) },
    { id: "zone", header: "Training zone", sort: d => d.tsb, cell: d => trainingZoneName(d.trainingZone), csv: d => trainingZoneName(d.trainingZone) },
    {
      id: "athleteSettings",
      header: "Settings",
      description: "Athlete settings used for the day's stress scores",
      cell: d => (
        <Show when={d.ids.length}>
          <IconButton icon="athlete" label="Athlete settings used" class="ft-small-icon" onClick={() => props.onShowSettings(d)} />
        </Show>
      ),
      csv: d => printAthleteSettings(d) ?? ""
    }
  ];

  const columns = createMemo(() => {
    const c = props.config;
    const hrss = c.heartRateImpulseMode === "HRSS";
    return allColumns.filter(col => {
      switch (col.id) {
        case "powerStressScore":
          return props.powerMeterEnabled;
        case "swimStressScore":
          return props.swimEnabled;
        case "zone":
          return props.zonesEnabled;
        case "runningStressScore":
          return c.allowEstimatedRunningStressScore && hrss;
        case "heartRateStressScore":
          return hrss;
        case "trainingImpulseScore":
          return !hrss;
        default:
          return true;
      }
    });
  });

  const rows = createMemo(() => {
    const q = search().trim().toLowerCase();
    let list = props.trend.filter(d => !d.previewDay);
    if (q) {
      list = list.filter(d =>
        [d.dateString, dayjs(d.date).format("ddd, MMM DD, YYYY"), ...d.types, ...d.activitiesName].some(s => s.toLowerCase().includes(q))
      );
    }
    const { id, desc } = sortBy();
    const col = allColumns.find(c => c.id === id);
    if (col?.sort) {
      const get = col.sort;
      list = [...list].sort((a, b) => {
        const va = get(a);
        const vb = get(b);
        // Empty values always sort last.
        if (va === null || va === "") return vb === null || vb === "" ? 0 : 1;
        if (vb === null || vb === "") return -1;
        const r = va < vb ? -1 : va > vb ? 1 : 0;
        return desc ? -r : r;
      });
    }
    return list;
  });

  const pageCount = () => Math.max(1, Math.ceil(rows().length / pageSize()));
  const pageRows = () => {
    const p = Math.min(page(), pageCount() - 1);
    return rows().slice(p * pageSize(), (p + 1) * pageSize());
  };

  const onSort = (col: Column) => {
    if (!col.sort) return;
    const cur = sortBy();
    setSortBy(cur.id === col.id ? { id: col.id, desc: !cur.desc } : { id: col.id, desc: true });
    setPage(0);
  };

  const exportCsv = () => {
    const cols = columns().filter(c => c.csv);
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map(c => c.id).join(","), ...props.trend.map(d => cols.map(c => esc(c.csv!(d))).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fitness_trend_export.${dayjs().format("YYYY.M.D-H.mm.ss")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div class="stack ft-table">
      <div class="row-wrap">
        <input
          type="search"
          class="ft-search"
          placeholder="Filter by date, type or activity name"
          value={search()}
          onInput={e => {
            setSearch(e.currentTarget.value);
            setPage(0);
          }}
        />
        <span class="spacer" />
        <Button icon="download" small onClick={exportCsv}>
          Export CSV
        </Button>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <For each={columns()}>
                {col => (
                  <th classList={{ sortable: !!col.sort }} title={col.description} onClick={() => onSort(col)}>
                    {col.header}
                    <Show when={sortBy().id === col.id}>{sortBy().desc ? " ▼" : " ▲"}</Show>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={pageRows()} fallback={<tr><td colspan={columns().length} class="muted">No matching days</td></tr>}>
              {d => (
                <tr classList={{ "ft-rest": !d.ids.length }}>
                  <For each={columns()}>{col => <td>{col.cell(d)}</td>}</For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="row-wrap ft-pager small muted">
        <span>Rows per page</span>
        <select
          onChange={e => {
            setPageSize(Number(e.currentTarget.value));
            setPage(0);
          }}
        >
          <For each={[5, 10, 15, 25, 50]}>{n => (
              <option value={n} selected={n === pageSize()}>
                {n}
              </option>
            )}</For>
        </select>
        <span class="spacer" />
        <span class="num">
          {rows().length === 0 ? 0 : Math.min(page(), pageCount() - 1) * pageSize() + 1}–
          {Math.min((Math.min(page(), pageCount() - 1) + 1) * pageSize(), rows().length)} of {rows().length}
        </span>
        <IconButton icon="chevronLeft" label="Previous page" disabled={page() === 0} onClick={() => setPage(Math.max(0, page() - 1))} />
        <IconButton
          icon="chevronRight"
          label="Next page"
          disabled={page() >= pageCount() - 1}
          onClick={() => setPage(Math.min(pageCount() - 1, page() + 1))}
        />
      </div>
    </div>
  );
}
