// Activities list: searchable / filterable / sortable table with a selectable column set,
// CSV export, delete, athlete-settings info and multi-activity compare selection.
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import dayjs from "dayjs";
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import { Button, Card, confirm, Dialog, Icon, IconButton } from "../../components/ui";
import { api } from "../../lib/api";
import { app } from "../../lib/state";
import { loadLocal, saveLocal } from "../../lib/storage";
import { toast } from "../../lib/toast";
import type { Activity } from "../../lib/types";
import { ColumnPicker } from "./ColumnPicker";
import { type Column, COLUMNS_BY_ID, resolveColumns } from "./columns";
import {
  compareHref,
  type Filters,
  filterActivities,
  printAthleteSettings,
  settingsLackHint,
  type SortDir,
  sortActivities,
  sportsByCount,
  toCsv
} from "./query";
import { SportFilter } from "./SportFilter";
import { SyncRequired } from "./SyncRequired";
import "./activities.css";

const LS_COLUMNS = "activities.columns";
const LS_PAGE_SIZE = "activities.pageSize";
const PAGE_SIZES = [10, 20, 50, 100];
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 8;

// Compare selection survives navigating to an activity and back.
const [compareIds, setCompareIds] = createSignal<string[]>([]);

const str = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

export default function ActivitiesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const system = app.measureSystem;

  // --- view state (filters/sort/page in the URL so back navigation restores them) ---
  const filters = createMemo<Filters>(() => ({
    name: str(params.q),
    sports: str(params.sports).split(",").filter(Boolean),
    from: str(params.from) || null,
    to: str(params.to) || null
  }));
  const sortId = () => str(params.sort) || null;
  const sortDir = (): SortDir => (str(params.dir) === "asc" ? "asc" : "desc");
  const page = () => Math.max(0, parseInt(str(params.page) || "0", 10) || 0);
  const update = (p: Record<string, string | null>) => setParams(p, { replace: true });
  const updateFilter = (p: Record<string, string | null>) => update({ ...p, page: null });

  const [columnIds, setColumnIds] = createSignal<string[]>(resolveColumns(loadLocal<string[] | null>(LS_COLUMNS, null)).map(c => c.id));
  const columns = createMemo(() => columnIds().map(id => COLUMNS_BY_ID.get(id)!).filter(Boolean));
  const setColumns = (ids: string[]) => {
    setColumnIds(ids);
    saveLocal(LS_COLUMNS, ids);
  };

  const [pageSize, setPageSizeSig] = createSignal<number>(loadLocal(LS_PAGE_SIZE, 20));
  const setPageSize = (n: number) => {
    setPageSizeSig(n);
    saveLocal(LS_PAGE_SIZE, n);
    update({ page: null });
  };

  // Debounced name search.
  const [nameInput, setNameInput] = createSignal(filters().name);
  let searchTimer: number | undefined;
  const onNameInput = (v: string) => {
    setNameInput(v);
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => updateFilter({ q: v.trim() ? v : null }), 250);
  };
  onCleanup(() => window.clearTimeout(searchTimer));
  // Keep the box in sync when the URL changes from elsewhere (back/forward, reset).
  createEffect(
    on(
      () => filters().name,
      n => {
        if (n.trim() !== nameInput().trim()) {
          window.clearTimeout(searchTimer);
          setNameInput(n);
        }
      },
      { defer: true }
    )
  );

  // --- data ---
  const all = app.activities;
  const sports = createMemo(() => sportsByCount(all()));
  const filtered = createMemo(() => filterActivities(all(), filters()));
  const sorted = createMemo(() => sortActivities(filtered(), sortId() ? COLUMNS_BY_ID.get(sortId()!) : undefined, sortDir()));
  const pageCount = createMemo(() => Math.max(1, Math.ceil(sorted().length / pageSize())));
  const pageIndex = createMemo(() => Math.min(page(), pageCount() - 1));
  const rows = createMemo(() => sorted().slice(pageIndex() * pageSize(), (pageIndex() + 1) * pageSize()));
  const lackingCount = createMemo(() => all().filter(a => a.settingsLack).length);
  const hasFilters = () => !!(filters().name || filters().sports.length || filters().from || filters().to);

  // Drop compare ids for activities that no longer exist.
  createEffect(() => {
    const ids = new Set(all().map(a => a.id));
    if (all().length && compareIds().some(id => !ids.has(id))) setCompareIds(compareIds().filter(id => ids.has(id)));
  });

  const onSort = (col: Column) => {
    if (sortId() === col.id) update({ dir: sortDir() === "desc" ? "asc" : "desc", page: null });
    else update({ sort: col.id, dir: col.kind === "number" || col.kind === "date" ? "desc" : "asc", page: null });
  };

  const resetFilters = () => {
    setNameInput("");
    update({ q: null, sports: null, from: null, to: null, sort: null, dir: null, page: null });
  };

  // --- actions ---
  const openActivity = (a: Activity) => navigate(`/activity/${encodeURIComponent(a.id)}`);

  const toggleCompare = (a: Activity, input: HTMLInputElement) => {
    const ids = compareIds();
    if (ids.includes(a.id)) {
      setCompareIds(ids.filter(id => id !== a.id));
    } else if (ids.length >= COMPARE_MAX) {
      input.checked = false;
      toast(`Up to ${COMPARE_MAX} activities can be compared at once.`);
    } else {
      setCompareIds([...ids, a.id]);
    }
  };

  const [settingsOf, setSettingsOf] = createSignal<Activity | null>(null);

  const deleteActivity = async (a: Activity) => {
    const ok = await confirm({
      title: `Deleting activity "${a.name}"`,
      message: "Are you sure? It will be fetched again by a full sync if it still exists in your health data.",
      confirmText: "Delete",
      danger: true
    });
    if (!ok) return;
    try {
      await api.deleteActivity(a.id);
      app.mutateActivities(list => (list ?? []).filter(x => x.id !== a.id));
      setCompareIds(compareIds().filter(id => id !== a.id));
      app.pollSoon();
      toast(`Deleted "${a.name}"`);
    } catch (e) {
      toast(`Delete failed: ${(e as Error).message}`, "error");
    }
  };

  const exportCsv = () => {
    const csv = toCsv(sorted(), columns(), system());
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `elevate_activities_export.${dayjs().format("YYYY.M.D-H.mm.ss")}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const today = dayjs().format("YYYY-MM-DD");

  return (
    <Show when={all().length > 0} fallback={<SyncRequired />}>
      <div class="act-page">
        <div class="act-toolbar">
          <div class="act-search">
            <input
              type="search"
              placeholder="Search by activity name"
              value={nameInput()}
              onInput={e => onNameInput(e.currentTarget.value)}
            />
          </div>
          <SportFilter sports={sports()} selected={filters().sports} onChange={s => updateFilter({ sports: s.length ? s.join(",") : null })} />
          <label class="act-date">
            <span class="muted small">From</span>
            <input type="date" max={filters().to ?? today} value={filters().from ?? ""} onChange={e => updateFilter({ from: e.currentTarget.value || null })} />
          </label>
          <label class="act-date">
            <span class="muted small">To</span>
            <input type="date" min={filters().from ?? undefined} max={today} value={filters().to ?? ""} onChange={e => updateFilter({ to: e.currentTarget.value || null })} />
          </label>
          <Show when={hasFilters()}>
            <Button variant="ghost" icon="close" onClick={resetFilters}>
              Reset
            </Button>
          </Show>
          <div class="spacer" />
          <ColumnPicker selected={columnIds()} onChange={setColumns} />
          <Button icon="download" onClick={exportCsv} title="Download a CSV of the filtered activities with the displayed columns" disabled={!sorted().length}>
            CSV
          </Button>
        </div>

        <Show when={lackingCount() > 0}>
          <div class="banner">
            <Icon name="warning" />
            <span>
              {lackingCount()} {lackingCount() === 1 ? "activity is" : "activities are"} missing stress scores because some athlete settings (e.g. FTP) are not set.
            </span>
            <div class="spacer" />
            <A href="/athlete">Athlete settings</A>
          </div>
        </Show>

        <Show when={compareIds().length > 0}>
          <div class="act-compare-bar">
            <Icon name="compare" />
            <span>
              <strong>{compareIds().length}</strong> selected for comparison
              <span class="muted small"> (2–{COMPARE_MAX})</span>
            </span>
            <Button variant="primary" icon="compare" disabled={compareIds().length < COMPARE_MIN} onClick={() => navigate(compareHref(compareIds()))}>
              Compare
            </Button>
            <Button variant="ghost" onClick={() => setCompareIds([])}>
              Clear
            </Button>
          </div>
        </Show>

        <Card class="act-card">
          <Show
            when={sorted().length > 0}
            fallback={
              <div class="empty-state">
                <h3>No activities are matching criteria.</h3>
                <Button onClick={resetFilters}>Reset filters</Button>
              </div>
            }
          >
            <div class="table-wrap act-table-wrap">
              <table class="data act-table">
                <thead>
                  <tr>
                    <th class="act-col-check" title="Tick activities to compare them together">
                      <Icon name="compare" size={16} />
                    </th>
                    <For each={columns()}>
                      {col => (
                        <th
                          classList={{ sortable: true, sorted: sortId() === col.id, "act-num": col.kind === "number" }}
                          title={col.description ?? ""}
                          onClick={() => onSort(col)}
                        >
                          {col.header}
                          <Show when={sortId() === col.id}>
                            <span class="act-sort-arrow">{sortDir() === "asc" ? "▲" : "▼"}</span>
                          </Show>
                        </th>
                      )}
                    </For>
                    <th class="act-col-actions" />
                  </tr>
                </thead>
                <tbody>
                  <For each={rows()}>
                    {a => (
                      <tr onDblClick={() => openActivity(a)} classList={{ "act-row-selected": compareIds().includes(a.id) }}>
                        <td class="act-col-check">
                          <input
                            type="checkbox"
                            aria-label="Select for comparison"
                            checked={compareIds().includes(a.id)}
                            onChange={e => toggleCompare(a, e.currentTarget)}
                          />
                        </td>
                        <For each={columns()}>
                          {col => (
                            <Show
                              when={col.kind === "link"}
                              fallback={
                                <td classList={{ "act-num": col.kind === "number", "act-muted": col.kind === "date" }}>{col.display(a, system())}</td>
                              }
                            >
                              <td class="act-name">
                                <A href={`/activity/${encodeURIComponent(a.id)}`} title={a.name}>
                                  {col.display(a, system())}
                                </A>
                                <Show when={a.settingsLack}>
                                  <A href="/athlete" class="act-lack" title={settingsLackHint(a)}>
                                    <Icon name="warning" size={16} />
                                  </A>
                                </Show>
                              </td>
                            </Show>
                          )}
                        </For>
                        <td class="act-col-actions">
                          <IconButton icon="athlete" label="Athlete settings used for this activity" onClick={() => setSettingsOf(a)} />
                          <IconButton icon="delete" label="Delete activity" onClick={() => deleteActivity(a)} />
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>

            <div class="act-footer">
              <span class="faint small">Hint: double-click a row to open the activity</span>
              <div class="spacer" />
              <label class="row small muted">
                Rows per page
                <select value={pageSize()} onChange={e => setPageSize(Number(e.currentTarget.value))}>
                  <For each={PAGE_SIZES}>{n => <option value={n}>{n}</option>}</For>
                </select>
              </label>
              <span class="small muted act-range">
                {pageIndex() * pageSize() + 1}–{Math.min(sorted().length, (pageIndex() + 1) * pageSize())} of {sorted().length}
                <Show when={sorted().length !== all().length}> (filtered from {all().length})</Show>
              </span>
              <div class="row act-pager">
                <button type="button" class="icon-btn" title="First page" aria-label="First page" disabled={pageIndex() === 0} onClick={() => update({ page: null })}>
                  «
                </button>
                <IconButton icon="chevronLeft" label="Previous page" disabled={pageIndex() === 0} onClick={() => update({ page: String(pageIndex() - 1) })} />
                <IconButton
                  icon="chevronRight"
                  label="Next page"
                  disabled={pageIndex() >= pageCount() - 1}
                  onClick={() => update({ page: String(pageIndex() + 1) })}
                />
                <button
                  type="button"
                  class="icon-btn"
                  title="Last page"
                  aria-label="Last page"
                  disabled={pageIndex() >= pageCount() - 1}
                  onClick={() => update({ page: String(pageCount() - 1) })}
                >
                  »
                </button>
              </div>
            </div>
          </Show>
        </Card>

        <Dialog open={!!settingsOf()} title="Calculated with athlete settings" onClose={() => setSettingsOf(null)}>
          <Show when={settingsOf()}>
            {a => (
              <div class="stack">
                <div class="muted small">
                  {a().name} · {dayjs(a().startTime).format("ddd, MMM D, YYYY")}
                </div>
                <div>{printAthleteSettings(a(), system()) ?? "No athlete settings recorded."}</div>
                <Show when={a().settingsLack}>
                  <div class="banner">
                    <Icon name="warning" />
                    <span>
                      {settingsLackHint(a())} <A href="/athlete" onClick={() => setSettingsOf(null)}>Open athlete settings</A>
                    </span>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </Dialog>
      </div>
    </Show>
  );
}
