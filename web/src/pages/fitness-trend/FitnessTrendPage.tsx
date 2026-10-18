import { useNavigate } from "@solidjs/router";
import dayjs from "dayjs";
import { createEffect, createMemo, createResource, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { Button, Card, EmptyState, IconButton, Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import { app } from "../../lib/state";
import { loadLocal, saveLocal } from "../../lib/storage";
import { toast } from "../../lib/toast";
import { ActivitiesDialog, ConfigDialog, HelpDialog, SettingsInfoDialog } from "./dialogs";
import {
  computeTrend,
  DATE_FORMAT,
  DEFAULT_CONFIG,
  FitnessError,
  hasActivities,
  normalizeConfig,
  type DayFitnessTrend,
  type FitnessTrendConfig
} from "./fitness";
import FitnessTrendGraph from "./FitnessTrendGraph";
import FitnessTrendInputs, { type Toggles } from "./FitnessTrendInputs";
import FitnessTrendLegend from "./FitnessTrendLegend";
import FitnessTrendTable from "./FitnessTrendTable";
import {
  backward,
  canBackward,
  canForward,
  canZoomIn,
  canZoomOut,
  DEFAULT_LAST_PERIOD_KEY,
  forward,
  lastPeriods,
  zoomIn,
  zoomOut,
  type Period
} from "./periods";
import "./fitness-trend.css";

const PREF_KEY = "fitnessTrendConfig";
const LS_TOGGLES = "fitnessTrend.toggles";
const LS_PERIOD = "fitnessTrend.lastPeriod";
const DEFAULT_TOGGLES: Toggles = { trainingZones: true, powerMeter: true, swim: true, eBikeRides: false };

export default function FitnessTrendPage() {
  const navigate = useNavigate();

  const [savedConfig, { mutate: setConfig }] = createResource(async () => {
    try {
      return normalizeConfig(await api.pref<FitnessTrendConfig>(PREF_KEY));
    } catch {
      return normalizeConfig(DEFAULT_CONFIG);
    }
  });
  const config = () => savedConfig() ?? null;

  const [toggles, setToggles] = createSignal<Toggles>({ ...DEFAULT_TOGGLES, ...loadLocal<Partial<Toggles>>(LS_TOGGLES, {}) });
  const [period, setPeriod] = createSignal<Period | null>(null);
  const [hoveredDay, setHoveredDay] = createSignal<DayFitnessTrend | null>(null);
  const [configOpen, setConfigOpen] = createSignal(false);
  const [helpOpen, setHelpOpen] = createSignal(false);
  const [linksDay, setLinksDay] = createSignal<DayFitnessTrend | null>(null);
  const [settingsDay, setSettingsDay] = createSignal<DayFitnessTrend | null>(null);

  // TRIMP scores aren't on the PSS/SSS/zones scale: those switch off in TRIMP mode.
  const hrss = () => config()?.heartRateImpulseMode !== "TRIMP";
  const zonesEnabled = () => hrss() && toggles().trainingZones;
  const powerMeterEnabled = () => hrss() && toggles().powerMeter;
  const swimEnabled = () => hrss() && toggles().swim;

  const result = createMemo(() => {
    const c = config();
    if (!c) return null;
    const activities = app.activities();
    try {
      const trend = computeTrend(activities, c, {
        powerMeterEnable: powerMeterEnabled(),
        swimEnable: swimEnabled(),
        skipActivityTypes: toggles().eBikeRides ? [] : ["EBikeRide"]
      });
      return { trend, error: null as string | null };
    } catch (e) {
      if (e instanceof FitnessError) return { trend: [] as DayFitnessTrend[], error: e.message };
      throw e;
    }
  });

  const trend = () => result()?.trend ?? [];
  const dateMin = () => trend()[0]?.dateString ?? "";
  const dateMax = () => trend()[trend().length - 1]?.dateString ?? "";
  const presets = createMemo(() => lastPeriods(dateMin()));
  const lastActiveDate = createMemo(() => {
    const t = trend();
    for (let i = t.length - 1; i >= 0; i--) if (hasActivities(t[i])) return t[i].dateString;
    return null;
  });
  const todayDay = createMemo(() => {
    const today = dayjs().format(DATE_FORMAT);
    return trend().find(d => d.dateString === today) ?? trend()[trend().length - 1] ?? null;
  });
  const viewedDay = () => hoveredDay() ?? todayDay();

  // Pick the initial period from the last preset viewed once a trend exists; keep the user's period
  // afterwards, re-anchoring presets when the data range changes.
  createEffect(() => {
    if (!dateMin()) return;
    const cur = period();
    const list = presets();
    if (!cur) {
      const key = loadLocal<string>(LS_PERIOD, DEFAULT_LAST_PERIOD_KEY);
      const p = list.find(x => x.key === key) ?? list.find(x => x.key === DEFAULT_LAST_PERIOD_KEY)!;
      setPeriod({ from: p.from, to: p.to, key: p.key });
    } else if (cur.key) {
      const p = list.find(x => x.key === cur.key);
      if (p && (p.from !== cur.from || p.to !== cur.to)) setPeriod({ from: p.from, to: p.to, key: p.key });
    }
  });

  const changePeriod = (p: Period) => {
    if (p.key) saveLocal(LS_PERIOD, p.key);
    setPeriod(p);
  };

  const nav = (action: "forward" | "backward" | "zoomIn" | "zoomOut") => {
    const p = period();
    if (!p) return;
    if (action === "forward" && canForward(p, dateMax())) setPeriod(forward(p));
    if (action === "backward" && canBackward(p, dateMin())) setPeriod(backward(p));
    if (action === "zoomIn" && canZoomIn(p)) setPeriod(zoomIn(p));
    if (action === "zoomOut" && canZoomOut(p, dateMin())) setPeriod(zoomOut(p));
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, select, textarea, [contenteditable]") || document.querySelector(".dialog-backdrop"))) return;
      if (!period()) return;
      const actions: Record<string, "forward" | "backward" | "zoomIn" | "zoomOut"> = {
        ArrowRight: "forward",
        ArrowLeft: "backward",
        ArrowUp: "zoomIn",
        ArrowDown: "zoomOut"
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      nav(action);
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const setToggle = (key: keyof Toggles, value: boolean) => {
    const next = { ...toggles(), [key]: value };
    setToggles(next);
    saveLocal(LS_TOGGLES, next);
  };

  const saveConfig = async (next: FitnessTrendConfig) => {
    const prev = config();
    setConfig(next);
    try {
      await api.savePref(PREF_KEY, next);
    } catch (e) {
      toast(`Couldn't save fitness trend settings: ${(e as Error).message}`, "error");
      if (prev) setConfig(prev);
    }
  };

  const openDay = (day: DayFitnessTrend) => {
    if (day.ids.length === 1) navigate(`/activity/${encodeURIComponent(day.ids[0])}`);
    else if (day.ids.length > 1) setLinksDay(day);
  };

  const headerActions = (
    <>
      <IconButton icon="settings" label="Fitness trend settings" onClick={() => setConfigOpen(true)} />
      <IconButton icon="info" label="About the fitness trend" onClick={() => setHelpOpen(true)} />
    </>
  );

  return (
    <div class="stack fitness-trend">
      <Switch>
        <Match when={!app.activitiesReady() && app.activities().length === 0 || !config()}>
          <Spinner label="Loading activities…" />
        </Match>
        <Match when={app.activities().length === 0}>
          <Card>
            <EmptyState title="No activities yet" icon="trend">
              Sync your workouts to see your fitness, fatigue and form over time.{" "}
              <a href="#" onClick={e => (e.preventDefault(), setHelpOpen(true))}>
                What is the fitness trend?
              </a>
            </EmptyState>
          </Card>
        </Match>
        <Match when={result()?.error || trend().length === 0}>
          <Card>
            <EmptyState title="Unable to generate the fitness trend" icon="warning">
              <Show when={result()?.error}>
                <p>{result()?.error}</p>
              </Show>
              <p>Your synced activities need at least one of:</p>
              <ul class="ft-requirements">
                <li>an activity recorded with a heart rate monitor (any sport),</li>
                <li>a ride with power data and a cycling FTP set,</li>
                <li>a run with a running threshold pace set, or a swim with a swim threshold pace set.</li>
              </ul>
              <p>Your exclusion patterns or "ignore before" date may also be too restrictive.</p>
              <Button icon="settings" onClick={() => setConfigOpen(true)}>
                Check fitness trend settings
              </Button>
            </EmptyState>
          </Card>
        </Match>
        <Match when={period() && viewedDay()}>
          <Card>
            <div class="ft-top">
              <div class="ft-top-inputs">
                <div class="row">
                  <FitnessTrendInputs
                    period={period()!}
                    lastPeriods={presets()}
                    dateMin={dateMin()}
                    dateMax={dateMax()}
                    mode={config()!.heartRateImpulseMode}
                    toggles={toggles()}
                    allowEstimatedPss={config()!.allowEstimatedPowerStressScore}
                    allowEstimatedRss={config()!.allowEstimatedRunningStressScore}
                    onPeriod={changePeriod}
                    onToggle={setToggle}
                    onEstimatedPss={v => saveConfig({ ...config()!, allowEstimatedPowerStressScore: v })}
                    onEstimatedRss={v => saveConfig({ ...config()!, allowEstimatedRunningStressScore: v })}
                  />
                  <div class="ft-actions">{headerActions}</div>
                </div>
              </div>
              <FitnessTrendLegend day={viewedDay()!} zonesEnabled={zonesEnabled()} />
            </div>
            <FitnessTrendGraph
              trend={trend()}
              period={period()!}
              dateMin={dateMin()}
              dateMax={dateMax()}
              zonesEnabled={zonesEnabled()}
              onPeriodNav={nav}
              onViewDay={setHoveredDay}
              onOpenDay={openDay}
            />
          </Card>
          <Card title="Fitness analysis table">
            <FitnessTrendTable
              trend={trend()}
              config={config()!}
              zonesEnabled={zonesEnabled()}
              powerMeterEnabled={powerMeterEnabled()}
              swimEnabled={swimEnabled()}
              onShowSettings={setSettingsDay}
            />
          </Card>
        </Match>
      </Switch>

      <Show when={config()}>
        <ConfigDialog
          open={configOpen()}
          config={config()!}
          powerMeterEnabled={powerMeterEnabled()}
          lastActiveDate={lastActiveDate()}
          onClose={() => setConfigOpen(false)}
          onSave={c => {
            setConfigOpen(false);
            void saveConfig(c);
          }}
        />
      </Show>
      <HelpDialog open={helpOpen()} onClose={() => setHelpOpen(false)} />
      <ActivitiesDialog day={linksDay()} onClose={() => setLinksDay(null)} />
      <SettingsInfoDialog day={settingsDay()} onClose={() => setSettingsDay(null)} />
    </div>
  );
}
