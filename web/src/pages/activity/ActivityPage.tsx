// Single activity view: header, summary tiles, map, analysis graph and stats/peaks/zones/laps/splits tabs.
import { A, useNavigate, useParams } from "@solidjs/router";
import { createMemo, createResource, createSignal, Match, Show, Switch } from "solid-js";
import MapView from "../../components/MapView";
import { Button, Card, confirm, EmptyState, Icon, IconButton, Spinner, Tabs } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { fmtDateTime, sportName } from "../../lib/format";
import { app } from "../../lib/state";
import { loadLocal, saveLocal } from "../../lib/storage";
import { cssVar, theme } from "../../lib/theme";
import { toast } from "../../lib/toast";
import type { Activity, Streams } from "../../lib/types";
import AnalysisGraph, { availableSensors, type Range } from "./AnalysisGraph";
import { BestSplitsTab } from "./BestSplits";
import EditDialog from "./EditDialog";
import { LapsTab } from "./LapsTable";
import { PeaksTab, peakSensors, ZonesTab } from "./PeaksZones";
import { formatAthleteSnapshot } from "./shared/snapshot";
import { zonesOf } from "./shared/charts";
import { provideSensors } from "./shared/sensors";
import { StatsPanels, SummaryTiles } from "./StatsViews";
import "./activity.css";

type TabId = "stats" | "peaks" | "zones" | "laps" | "splits";

export default function ActivityPage() {
  const params = useParams();
  const navigate = useNavigate();
  // Errors are returned as values: reading an errored resource throws, which would escape the
  // page instead of showing the "not found" state.
  const [loaded, { mutate: mutateLoaded }] = createResource(
    // Links URL-encode ids (they contain ":"), and the router hands params over undecoded.
    () => decodeURIComponent(params.id ?? ""),
    id => api.activity(id).then(a => ({ a, error: null }), (e: Error) => ({ a: null, error: e }))
  );
  const activity = () => loaded()?.a ?? null;
  const loadError = () => loaded()?.error ?? null;
  const mutate = (a: Activity) => mutateLoaded({ a, error: null });
  const [streamsRev, setStreamsRev] = createSignal(0);
  const [streams] = createResource(
    () => {
      const a = activity();
      return a && a.hasStreams ? { id: a.id, rev: streamsRev() } : null;
    },
    s => api.streams(s.id)
  );

  return (
    <Switch>
      <Match when={loadError()}>
        <EmptyState title="Activity not found" icon="warning">
          {(loadError() as ApiError).status === 404 ? "It may have been deleted." : loadError()!.message}{" "}
          <A href="/activities">Back to activities</A>
        </EmptyState>
      </Match>
      <Match when={activity()}>
        <ActivityView
          activity={activity()!}
          streams={streams.loading ? undefined : (streams() ?? null)}
          onChanged={(a, recomputed) => {
            mutate(a);
            if (recomputed) setStreamsRev(streamsRev() + 1);
            app.pollSoon();
          }}
          onDeleted={() => {
            app.pollSoon();
            navigate("/activities");
          }}
        />
      </Match>
      <Match when={true}>
        <Spinner label="Loading activity…" />
      </Match>
    </Switch>
  );
}

function ActivityView(props: {
  activity: Activity;
  /** undefined while loading; null when the activity has no streams. */
  streams: Streams | null | undefined;
  onChanged: (a: Activity, recomputed: boolean) => void;
  onDeleted: () => void;
}) {
  const ms = () => app.measureSystem();
  const a = () => props.activity;
  const latlng = () => props.streams?.latlng ?? [];
  const hasMap = () => latlng().length > 1;

  // Section highlighted on the map (graph zoom, lap, split, peak) and graph hover position.
  const [selection, setSelection] = createSignal<{ range: Range; source: "graph" | "table" } | null>(null);
  const [cursor, setCursor] = createSignal<number | null>(null);
  const selectFromTable = (range: Range) => {
    if (range[1] - range[0] < 1) return toast("Section is too short to be displayed.");
    setSelection({ range, source: "table" });
  };

  const [showGraph, setShowGraph] = createSignal(loadLocal("activity.showGraph", true));
  const [editOpen, setEditOpen] = createSignal(false);
  const [recalculating, setRecalculating] = createSignal(false);

  const tabs = createMemo(() => {
    const out: { id: TabId; label: string }[] = [{ id: "stats", label: "Stats" }];
    if (peakSensors(a()).length) out.push({ id: "peaks", label: "Peaks" });
    if (provideSensors(a()).some(s => zonesOf(a(), s))) out.push({ id: "zones", label: "Time in Zones" });
    if (a().laps?.length) out.push({ id: "laps", label: "Laps" });
    if (props.streams) out.push({ id: "splits", label: "Best Splits" });
    return out;
  });
  const [tabPref, setTabPref] = createSignal<TabId>(loadLocal("activity.tab", "stats"));
  const tab = () => (tabs().some(t => t.id === tabPref()) ? tabPref() : "stats");

  const tracks = createMemo(() => {
    theme();
    return hasMap() ? [{ latlng: latlng(), color: cssVar("--c-hr") }] : [];
  });

  const recalculate = async () => {
    setRecalculating(true);
    try {
      props.onChanged(await api.recalculateActivity(a().id), true);
      toast("Activity has been recalculated.");
    } catch (e) {
      toast(`Recalculation failed: ${(e as Error).message}`, "error");
    } finally {
      setRecalculating(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${a().name}"?`,
      message: "The activity is removed from Elevate. A full sync may fetch it back from the health data service.",
      confirmText: "Delete",
      danger: true
    });
    if (!ok) return;
    try {
      await api.deleteActivity(a().id);
      toast("Activity deleted.");
      props.onDeleted();
    } catch (e) {
      toast(`Could not delete: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div class="activity-page stack">
      <header class="activity-header">
        <IconButton icon="back" label="Back" onClick={() => (history.length > 1 ? history.back() : (location.hash = "#/activities"))} />
        <div class="activity-title">
          <h1>{a().name}</h1>
          <div class="activity-meta muted small row-wrap">
            <span class="chip">{sportName(a().type)}</span>
            <span title={`Ended ${fmtDateTime(a().endTime)}`}>
              <Icon name="calendar" size={14} /> {fmtDateTime(a().startTime)}
            </span>
            <Show when={a().device}>
              <span title="Device used during activity">· {a().device}</span>
            </Show>
            <Show when={a().hasPowerMeter}>
              <span title="Real power sensor available">
                <Icon name="bolt" size={14} /> Real power
              </span>
            </Show>
            <Show when={a().trainer}>
              <span>· Indoor</span>
            </Show>
            <Show when={a().commute}>
              <span>· Commute</span>
            </Show>
          </div>
          <div class="activity-meta faint small" title="Athlete settings used to compute this activity">
            <Icon name="athlete" size={14} /> {formatAthleteSnapshot(a(), ms())} <A href="/athlete">[configure]</A>
          </div>
          <Show when={a().notes}>
            <div class="activity-notes small">{a().notes}</div>
          </Show>
        </div>
        <div class="activity-actions row-wrap">
          <Button icon="edit" small onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button icon="refresh" small disabled={recalculating()} onClick={recalculate}>
            {recalculating() ? "Recalculating…" : "Recalculate"}
          </Button>
          <Button icon="delete" small variant="danger" onClick={remove}>
            Delete
          </Button>
        </div>
      </header>

      <Show when={a().settingsLack}>
        <div class="banner small">
          <Icon name="warning" />
          <span>
            Some stats are missing because athlete settings (eg FTP or threshold pace) were not set for this date.{" "}
            <A href="/athlete">Configure athlete settings</A>
          </span>
        </div>
      </Show>

      <div class="activity-top" classList={{ "with-map": hasMap() }}>
        <Show when={hasMap()}>
          <div class="activity-map">
            <MapView
              tracks={tracks()}
              highlight={selection()?.range ?? null}
              cursorIndex={cursor()}
              style="width:100%;height:100%;min-height:360px;border-radius:var(--radius)"
            />
          </div>
        </Show>
        <Card class="summary-card">
          <SummaryTiles activity={a()} measureSystem={ms()} compact={hasMap()} />
        </Card>
      </div>

      <Show when={props.streams === undefined && a().hasStreams}>
        <Spinner label="Loading streams…" />
      </Show>

      <Show when={props.streams && availableSensors(a(), props.streams).length}>
        <Card
          title="Analysis graph"
          actions={
            <Button
              small
              variant="ghost"
              onClick={() => {
                setShowGraph(!showGraph());
                saveLocal("activity.showGraph", showGraph());
              }}
            >
              {showGraph() ? "Hide" : "Show analysis graph"}
            </Button>
          }
        >
          <Show when={showGraph()}>
            <AnalysisGraph
              activity={a()}
              streams={props.streams!}
              measureSystem={ms()}
              highlight={selection()?.source === "table" ? selection()!.range : null}
              onHover={setCursor}
              onSelect={r => setSelection(r ? { range: r, source: "graph" } : null)}
            />
          </Show>
        </Card>
      </Show>

      <Card>
        <Tabs
          tabs={tabs()}
          active={tab()}
          onChange={t => {
            setTabPref(t);
            saveLocal("activity.tab", t);
          }}
        />
        <Show when={selection()?.source === "table"}>
          <div class="selection-bar small row">
            <span class="muted">A section is highlighted on the map{showGraph() ? " and graph" : ""}.</span>
            <Button small variant="ghost" onClick={() => setSelection(null)}>
              Clear
            </Button>
          </div>
        </Show>
        <Switch>
          <Match when={tab() === "stats"}>
            <StatsPanels activity={a()} measureSystem={ms()} />
          </Match>
          <Match when={tab() === "peaks"}>
            <PeaksTab activity={a()} measureSystem={ms()} hasMap={hasMap()} onSelect={selectFromTable} />
          </Match>
          <Match when={tab() === "zones"}>
            <ZonesTab activity={a()} measureSystem={ms()} />
          </Match>
          <Match when={tab() === "laps"}>
            <LapsTab activity={a()} measureSystem={ms()} selected={selection()?.range ?? null} onSelect={selectFromTable} />
          </Match>
          <Match when={tab() === "splits" && props.streams}>
            <BestSplitsTab
              activity={a()}
              streams={props.streams!}
              measureSystem={ms()}
              selected={selection()?.range ?? null}
              onSelect={selectFromTable}
            />
          </Match>
        </Switch>
      </Card>

      <EditDialog
        open={editOpen()}
        activity={a()}
        onClose={() => setEditOpen(false)}
        onSaved={updated => props.onChanged(updated, updated.type !== a().type)}
      />
    </div>
  );
}
