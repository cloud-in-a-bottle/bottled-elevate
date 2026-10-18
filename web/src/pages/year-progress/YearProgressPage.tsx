// Year progressions: cumulative (year to date) or rolling-window totals per year, compared day by day.
import dayjs from "dayjs";
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import { Button, Card, confirm, EmptyState, IconButton, PageHeader, Segmented, Select, Spinner, Switch } from "../../components/ui";
import { api } from "../../lib/api";
import { sportName } from "../../lib/format";
import { app } from "../../lib/state";
import { loadLocal, saveLocal } from "../../lib/storage";
import { toast } from "../../lib/toast";
import {
  DEFAULT_ROLLING_MULTIPLIER,
  DEFAULT_ROLLING_PERIOD,
  ProgressConfig,
  ProgressMode,
  ProgressPreset,
  ProgressType,
  ROLLING_PERIODS,
  RollingPeriod,
  YearProgressModel
} from "./models";
import { rollingLabel } from "./format";
import {
  availableYears as computeAvailableYears,
  cleanTarget,
  findRollingDays,
  findSamePreset,
  newPresetId,
  progressions,
  provideProgressTypes,
  rollingTargetProgression,
  yearToDateTargetProgression
} from "./yearProgress";
import YearProgressGraph from "./YearProgressGraph";
import YearProgressTable from "./YearProgressTable";
import { AddPresetDialog, ManagePresetsDialog } from "./PresetDialogs";
import { HelpDialog, OverviewDialog } from "./InfoDialogs";
import "./year-progress.css";

const PALETTE = ["#7867c7", "#fe5d26", "#0ece34", "#cc4498", "#989898", "#006dff", "#e1ab19", "#da233f", "#00bfa8", "#8d6e63"];
const PRESETS_KEY = "yearProgressPresets";
const VIEW_KEY = "yearProgress.view";

interface ViewState {
  mode: ProgressMode;
  progressType: ProgressType;
  /** null until the user picks: defaults to the most performed sport. */
  activityTypes: string[] | null;
  includeCommuteRide: boolean;
  includeIndoorRide: boolean;
  rollingPeriod: RollingPeriod;
  periodMultiplier: number;
  /** null = every year. */
  selectedYears: number[] | null;
  /** Target of the last created/loaded preset; cleared when mode, type or period change. */
  targetValue: number | null;
  expanded: boolean;
}

const DEFAULT_VIEW: ViewState = {
  mode: ProgressMode.YEAR_TO_DATE,
  progressType: ProgressType.DISTANCE,
  activityTypes: null,
  includeCommuteRide: true,
  includeIndoorRide: true,
  rollingPeriod: DEFAULT_ROLLING_PERIOD,
  periodMultiplier: DEFAULT_ROLLING_MULTIPLIER,
  selectedYears: null,
  targetValue: null,
  expanded: false
};

export default function YearProgressPage() {
  const [view, setView] = createSignal<ViewState>({ ...DEFAULT_VIEW, ...loadLocal<Partial<ViewState>>(VIEW_KEY, {}) });
  const patch = (p: Partial<ViewState>) => setView(v => ({ ...v, ...p }));
  createEffect(() => saveLocal(VIEW_KEY, view()));

  const [presetsRes, { mutate: setPresets }] = createResource(async () => (await api.pref<ProgressPreset[]>(PRESETS_KEY)) ?? []);
  const presets = () => (Array.isArray(presetsRes()) ? presetsRes()! : []);

  const today = new Date();
  const currentYear = today.getFullYear();
  const isMetric = () => app.measureSystem() !== "imperial";
  const progressTypes = createMemo(() => provideProgressTypes(isMetric()));
  const progressType = () => progressTypes().find(t => t.type === view().progressType) ?? progressTypes()[0];

  // Sports performed, most performed first
  const sports = createMemo(() => {
    const counts = new Map<string, number>();
    for (const a of app.activities()) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }));
  });
  const activityTypes = createMemo(() => {
    const available = new Set(sports().map(s => s.type));
    const chosen = (view().activityTypes ?? []).filter(t => available.has(t));
    return chosen.length > 0 ? chosen : sports().slice(0, 1).map(s => s.type);
  });

  const availableYears = createMemo(() => computeAvailableYears(app.activities(), today));
  const selectedYears = createMemo(() => {
    const all = availableYears();
    const chosen = (view().selectedYears ?? []).filter(y => all.includes(y));
    return view().selectedYears && chosen.length > 0 ? chosen : all;
  });

  const rollingDays = () => findRollingDays(view().rollingPeriod, view().periodMultiplier);
  const config = createMemo<ProgressConfig>(() => ({
    mode: view().mode,
    activityTypes: activityTypes(),
    includeCommuteRide: view().includeCommuteRide,
    includeIndoorRide: view().includeIndoorRide,
    rollingDays: view().mode === ProgressMode.ROLLING ? rollingDays() : undefined
  }));

  const yearProgressions = createMemo<YearProgressModel[]>(() => {
    const activities = app.activities();
    if (activities.length === 0) return [];
    try {
      return progressions(config(), isMetric(), activities, today);
    } catch {
      return [];
    }
  });

  const colors = createMemo(() => {
    const map = new Map<number, string>();
    yearProgressions().forEach((yp, i) => map.set(yp.year, PALETTE[i % PALETTE.length]));
    return map;
  });

  const targets = createMemo(() => {
    const t = view().targetValue;
    if (t === null || t === undefined) return null;
    return view().mode === ProgressMode.YEAR_TO_DATE
      ? yearToDateTargetProgression(currentYear, t)
      : rollingTargetProgression(currentYear, t);
  });

  // Day shown in the table: hovered day, else the pinned marker (today by default)
  const [marker, setMarker] = createSignal(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [hovered, setHovered] = createSignal<Date | null>(null);
  const watched = () => hovered() ?? marker();
  const markerIsToday = () => marker().getMonth() === today.getMonth() && marker().getDate() === today.getDate();

  // --- control handlers ---

  const setMode = (mode: ProgressMode) => patch({ mode, targetValue: null });
  const setProgressType = (t: ProgressType) => patch({ progressType: t, targetValue: null });
  const setRollingPeriod = (p: RollingPeriod) => patch({ rollingPeriod: p, targetValue: null });
  const [multiplierInput, setMultiplierInput] = createSignal(String(view().periodMultiplier));
  const applyMultiplier = () => {
    const v = parseInt(multiplierInput(), 10);
    if (v >= 1 && v <= 999) {
      if (v !== view().periodMultiplier) patch({ periodMultiplier: v, targetValue: null });
    } else setMultiplierInput(String(view().periodMultiplier));
  };
  createEffect(() => setMultiplierInput(String(view().periodMultiplier)));

  const toggleSport = (type: string) => {
    const current = activityTypes();
    if (current.includes(type)) {
      if (current.length > 1) patch({ activityTypes: current.filter(t => t !== type) });
    } else patch({ activityTypes: [...current, type] });
  };
  const toggleYear = (year: number) => {
    const current = selectedYears();
    if (current.includes(year)) {
      if (current.length > 1) patch({ selectedYears: current.filter(y => y !== year) });
    } else patch({ selectedYears: [...current, year] });
  };

  // --- presets ---

  const [addOpen, setAddOpen] = createSignal(false);
  const [manageOpen, setManageOpen] = createSignal(false);
  const [overviewOpen, setOverviewOpen] = createSignal(false);
  const [helpOpen, setHelpOpen] = createSignal(false);

  const savePresets = async (list: ProgressPreset[]) => {
    await api.savePref(PRESETS_KEY, list);
    setPresets(list);
  };

  const createPreset = async (targetValue: number | null) => {
    const v = view();
    const preset: ProgressPreset = {
      id: newPresetId(),
      mode: v.mode,
      progressType: v.progressType,
      activityTypes: activityTypes(),
      includeCommuteRide: v.includeCommuteRide,
      includeIndoorRide: v.includeIndoorRide,
      targetValue,
      ...(v.mode === ProgressMode.ROLLING ? { rollingPeriod: v.rollingPeriod, periodMultiplier: v.periodMultiplier } : {})
    };
    if (findSamePreset(presets(), preset)) {
      toast("You already saved this preset.", "error");
      return;
    }
    try {
      await savePresets([...presets(), preset]);
      patch({ targetValue });
      setAddOpen(false);
      toast("Preset saved");
    } catch (e) {
      toast(`Could not save preset: ${(e as Error).message}`, "error");
    }
  };

  const loadPreset = (p: ProgressPreset) => {
    const isRolling = p.mode === ProgressMode.ROLLING;
    patch({
      mode: isRolling ? ProgressMode.ROLLING : ProgressMode.YEAR_TO_DATE,
      progressType: p.progressType,
      activityTypes: p.activityTypes,
      includeCommuteRide: !!p.includeCommuteRide,
      includeIndoorRide: !!p.includeIndoorRide,
      targetValue: cleanTarget(p.targetValue),
      ...(isRolling
        ? {
            rollingPeriod: (ROLLING_PERIODS as string[]).includes(p.rollingPeriod ?? "") ? (p.rollingPeriod as RollingPeriod) : DEFAULT_ROLLING_PERIOD,
            periodMultiplier: p.periodMultiplier && p.periodMultiplier >= 1 ? p.periodMultiplier : DEFAULT_ROLLING_MULTIPLIER
          }
        : {})
    });
    setManageOpen(false);
  };

  const deletePreset = async (p: ProgressPreset) => {
    if (!(await confirm({ title: "Delete preset", message: "Are you sure to remove this preset?", confirmText: "Delete", danger: true }))) return;
    try {
      await savePresets(presets().filter(x => x !== p));
    } catch (e) {
      toast(`Could not delete preset: ${(e as Error).message}`, "error");
      return;
    }
    // Hide the displayed target line if it came from that preset
    const v = view();
    const current: ProgressPreset = {
      id: "",
      mode: v.mode,
      progressType: v.progressType,
      activityTypes: activityTypes(),
      includeCommuteRide: v.includeCommuteRide,
      includeIndoorRide: v.includeIndoorRide,
      targetValue: v.targetValue,
      rollingPeriod: v.rollingPeriod,
      periodMultiplier: v.periodMultiplier
    };
    if (v.targetValue !== null && findSamePreset([p], current)) patch({ targetValue: null });
  };

  // --- titles ---

  const graphTitle = () => {
    const v = view();
    const t = progressType();
    const what = t.label.toLowerCase();
    const head = v.mode === ProgressMode.YEAR_TO_DATE ? `Total ${what} since January 1st` : `Total ${what} on ${rollingLabel(v.rollingPeriod, v.periodMultiplier)}`;
    return head + (t.unit ? ` (${t.unit})` : "");
  };
  const tableTitle = () => {
    const end = dayjs(watched());
    const start = view().mode === ProgressMode.ROLLING ? end.subtract(rollingDays(), "day").format("MMMM D") : "January 1st";
    return `${start} → ${end.format("MMMM D")}`;
  };

  const graphHeight = Math.max(300, Math.min(560, Math.round(window.innerHeight * 0.55)));

  return (
    <div class="stack">
      <PageHeader title="Year Progressions">
        <Button icon="add" onClick={() => setAddOpen(true)} title="Save the current selection as a preset, with or without target">
          Create preset
        </Button>
        <Show when={presets().length > 0}>
          <Button onClick={() => setManageOpen(true)} title="Load a saved preset and its target">
            Presets ({presets().length})
          </Button>
        </Show>
        <IconButton icon="info" label="Help" onClick={() => setHelpOpen(true)} />
      </PageHeader>

      <Show
        when={app.activities().length > 0}
        fallback={
          <Show when={app.activitiesReady()} fallback={<Spinner label="Loading activities…" />}>
            <EmptyState title="No activities yet" icon="calendar">
              Sync your workouts to compare your yearly progressions. Year to date mode shows your totals since January 1st against
              previous years; rolling mode shows the volume maintained over a sliding window.
            </EmptyState>
          </Show>
        }
      >
        <Card>
          <div class="yp-controls">
            <div class="row-wrap">
              <Segmented
                options={[
                  { value: ProgressMode.YEAR_TO_DATE, label: "Year to date" },
                  { value: ProgressMode.ROLLING, label: "Rolling" }
                ]}
                value={view().mode}
                onChange={setMode}
              />
              <Show when={view().mode === ProgressMode.ROLLING}>
                <div class="row yp-rolling">
                  <span class="muted small">Last</span>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    class="yp-multiplier"
                    aria-label="Period multiplier"
                    value={multiplierInput()}
                    onInput={e => setMultiplierInput(e.currentTarget.value)}
                    onChange={applyMultiplier}
                    onKeyDown={e => e.key === "Enter" && applyMultiplier()}
                  />
                  <Select
                    value={view().rollingPeriod}
                    options={ROLLING_PERIODS.map(p => ({ value: p, label: p.toLowerCase() }))}
                    onChange={setRollingPeriod}
                  />
                </div>
              </Show>
              <Segmented options={progressTypes().map(t => ({ value: t.type, label: t.label }))} value={view().progressType} onChange={setProgressType} />
              <span class="spacer" />
              <Switch
                checked={view().includeCommuteRide}
                onChange={v => patch({ includeCommuteRide: v })}
                label="Commutes"
                title="Include commute activities in your progression"
              />
              <Switch
                checked={view().includeIndoorRide}
                onChange={v => patch({ includeIndoorRide: v })}
                label="Indoor"
                title="Include indoor activities in your progression"
              />
            </div>

            <div class="yp-picker">
              <span class="yp-picker-label muted small">Sports</span>
              <div class="row-wrap">
                <For each={sports()}>
                  {s => (
                    <button
                      type="button"
                      class="chip yp-chip"
                      classList={{ active: activityTypes().includes(s.type) }}
                      aria-pressed={activityTypes().includes(s.type)}
                      onClick={() => toggleSport(s.type)}
                      title={`${s.count} activities`}
                    >
                      {sportName(s.type)}
                    </button>
                  )}
                </For>
                <button type="button" class="yp-link" onClick={() => patch({ activityTypes: sports().map(s => s.type) })}>
                  All
                </button>
                <button type="button" class="yp-link" onClick={() => patch({ activityTypes: null })} title="Most performed sport only">
                  Reset
                </button>
              </div>
            </div>

            <div class="yp-picker">
              <span class="yp-picker-label muted small">Years</span>
              <div class="row-wrap">
                <For each={availableYears()}>
                  {year => (
                    <button
                      type="button"
                      class="chip yp-chip"
                      classList={{ active: selectedYears().includes(year) }}
                      aria-pressed={selectedYears().includes(year)}
                      onClick={() => toggleYear(year)}
                    >
                      <span class="yp-dot" style={{ background: colors().get(year) }} />
                      {year}
                    </button>
                  )}
                </For>
                <button type="button" class="yp-link" onClick={() => patch({ selectedYears: null })}>
                  All
                </button>
                <button type="button" class="yp-link" onClick={() => patch({ selectedYears: [currentYear] })}>
                  Current only
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Show
          when={yearProgressions().length > 0}
          fallback={<EmptyState title="Nothing to show">No activities match the selected sports.</EmptyState>}
        >
          <div class="yp-main" classList={{ expanded: view().expanded }}>
            <Card
              title={
                <span>
                  {graphTitle()}
                  <Show when={view().targetValue !== null}>
                    <span class="yp-target">
                      {" "}
                      → Target {view().targetValue!.toLocaleString()}
                      {progressType().shortUnit ? ` ${progressType().shortUnit}` : ""}
                    </span>
                  </Show>
                </span>
              }
              actions={
                <>
                  <Show when={!markerIsToday()}>
                    <Button small variant="ghost" onClick={() => setMarker(new Date(today.getFullYear(), today.getMonth(), today.getDate()))}>
                      Back to today
                    </Button>
                  </Show>
                  <IconButton
                    class="yp-expand"
                    icon={view().expanded ? "chevronRight" : "chevronLeft"}
                    label={view().expanded ? "Show table beside graph" : "Expand graph"}
                    onClick={() => patch({ expanded: !view().expanded })}
                  />
                </>
              }
            >
              <YearProgressGraph
                yearProgressions={yearProgressions()}
                selectedYears={selectedYears()}
                progressType={progressType()}
                colors={colors()}
                targets={targets()}
                marker={marker()}
                currentYear={currentYear}
                height={graphHeight}
                onHover={setHovered}
                onUnhover={() => setHovered(null)}
                onClick={d => {
                  setMarker(d);
                  setHovered(null);
                }}
              />
              <div class="small faint">Hover to compare a day across years, click to pin it.</div>
            </Card>

            <Card
              title={tableTitle()}
              actions={
                <Button small onClick={() => setOverviewOpen(true)} title="Every progress type on this day">
                  Overview
                </Button>
              }
            >
              <YearProgressTable
                yearProgressions={yearProgressions()}
                selectedYears={selectedYears()}
                progressType={progressType()}
                colors={colors()}
                targets={targets()}
                watched={watched()}
                today={today}
                mode={view().mode}
                rollingDays={rollingDays()}
              />
            </Card>
          </div>
        </Show>
      </Show>

      <AddPresetDialog
        open={addOpen()}
        onClose={() => setAddOpen(false)}
        onSave={createPreset}
        draft={{
          mode: view().mode,
          progressType: progressType(),
          activityTypes: activityTypes(),
          includeCommuteRide: view().includeCommuteRide,
          includeIndoorRide: view().includeIndoorRide,
          rollingPeriod: view().rollingPeriod,
          periodMultiplier: view().periodMultiplier,
          targetValue: view().targetValue
        }}
      />
      <ManagePresetsDialog
        open={manageOpen()}
        presets={presets()}
        progressTypes={progressTypes()}
        onClose={() => setManageOpen(false)}
        onLoad={loadPreset}
        onDelete={deletePreset}
      />
      <OverviewDialog
        open={overviewOpen()}
        onClose={() => setOverviewOpen(false)}
        watched={marker()}
        today={today}
        mode={view().mode}
        rollingDays={rollingDays()}
        activityTypes={activityTypes()}
        progressTypes={progressTypes()}
        yearProgressions={yearProgressions()}
        selectedYears={selectedYears()}
        colors={colors()}
      />
      <HelpDialog open={helpOpen()} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
