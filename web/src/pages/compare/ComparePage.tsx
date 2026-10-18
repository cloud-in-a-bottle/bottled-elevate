// Multi-activity compare view: legend chips, overlaid map, stacked graphs, stats and peaks tabs.
import { A, useNavigate, useParams } from "@solidjs/router";
import dayjs from "dayjs";
import { createMemo, createResource, createSignal, For, Match, Show, Switch } from "solid-js";
import MapView from "../../components/MapView";
import { Card, EmptyState, IconButton, Spinner, Tabs } from "../../components/ui";
import { api } from "../../lib/api";
import { sportName } from "../../lib/format";
import { app } from "../../lib/state";
import { loadLocal, saveLocal } from "../../lib/storage";
import { theme } from "../../lib/theme";
import type { Activity, Streams } from "../../lib/types";
import "../activity/activity.css";
import "./compare.css";
import { COMPARE_MAX_WORKOUTS, COMPARE_PALETTE, type ComparedWorkout } from "./compare-model";
import CompareGraphs from "./CompareGraphs";
import { ComparePeaksTab, CompareStatsTab, buildPeaksRows } from "./CompareTabs";

interface Loaded {
  activity: Activity;
  streams: Streams | null;
}

async function load(ids: string[]): Promise<Loaded[]> {
  const loaded = await Promise.all(
    ids.map(async id => {
      try {
        const activity = await api.activity(id);
        const streams = activity.hasStreams ? await api.streams(id).catch(() => null) : null;
        return { activity, streams };
      } catch {
        return null;
      }
    })
  );
  return loaded.filter((l): l is Loaded => !!l).sort((a, b) => a.activity.startTimestamp - b.activity.startTimestamp);
}

type TabId = "stats" | "peaks";

export default function ComparePage() {
  const params = useParams();
  const navigate = useNavigate();
  const ids = createMemo(() =>
    [...new Set((params.ids ?? "").split(",").map(s => decodeURIComponent(s.trim())).filter(Boolean))].slice(0, COMPARE_MAX_WORKOUTS)
  );
  const [loaded] = createResource(() => (ids().length >= 2 ? ids() : null), load);

  const workouts = createMemo<ComparedWorkout[]>(() => {
    const palette = COMPARE_PALETTE[theme()];
    return (loaded() ?? []).map((l, i) => ({
      ...l,
      color: palette[i % palette.length],
      label: `${dayjs(l.activity.startTime).format("MMM D, YYYY")} · ${l.activity.name}`
    }));
  });
  const mapTracks = createMemo(() =>
    workouts()
      .filter(w => (w.streams?.latlng?.length ?? 0) > 1)
      .map(w => ({ latlng: w.streams!.latlng!, color: w.color, label: w.label }))
  );

  const tabs = createMemo(() => {
    const out: { id: TabId; label: string }[] = [{ id: "stats", label: "Stats" }];
    if (buildPeaksRows(workouts()).length) out.push({ id: "peaks", label: "Peaks" });
    return out;
  });
  const [tabPref, setTabPref] = createSignal<TabId>(loadLocal("compare.tab", "stats"));
  const tab = () => (tabs().some(t => t.id === tabPref()) ? tabPref() : "stats");

  const back = () => (history.length > 1 ? history.back() : navigate("/activities"));

  return (
    <Switch>
      <Match when={ids().length < 2}>
        <EmptyState title="Nothing to compare" icon="compare">
          At least 2 activities are required for comparison. Select them in the <A href="/activities">activities table</A>.
        </EmptyState>
      </Match>
      <Match when={loaded.loading}>
        <Spinner label="Loading activities…" />
      </Match>
      <Match when={workouts().length < 2}>
        <EmptyState title="Unable to find the activities to compare" icon="warning">
          <A href="/activities">Back to activities</A>
        </EmptyState>
      </Match>
      <Match when={true}>
        <div class="compare-page stack">
          <header class="activity-header">
            <IconButton icon="back" label="Back" onClick={back} />
            <div class="activity-title">
              <h1>Compare {workouts().length} activities</h1>
              <div class="workouts-legend">
                <For each={workouts()}>
                  {w => (
                    <A class="workout-chip" href={`/activity/${encodeURIComponent(w.activity.id)}`} title="Open activity">
                      <span class="workout-color-dot" style={{ background: w.color }} />
                      <span>{w.label}</span>
                      <span class="faint small">{sportName(w.activity.type)}</span>
                    </A>
                  )}
                </For>
              </div>
            </div>
          </header>

          <Show when={mapTracks().length}>
            <div class="compare-map">
              <MapView tracks={mapTracks()} style="width:100%;height:100%;border-radius:var(--radius)" />
            </div>
          </Show>

          <Show when={workouts().some(w => w.streams)}>
            <Card title="Analysis graphs">
              <CompareGraphs workouts={workouts()} measureSystem={app.measureSystem()} />
            </Card>
          </Show>

          <Card>
            <Tabs
              tabs={tabs()}
              active={tab()}
              onChange={t => {
                setTabPref(t);
                saveLocal("compare.tab", t);
              }}
            />
            <Switch>
              <Match when={tab() === "stats"}>
                <CompareStatsTab workouts={workouts()} measureSystem={app.measureSystem()} />
              </Match>
              <Match when={tab() === "peaks"}>
                <ComparePeaksTab workouts={workouts()} measureSystem={app.measureSystem()} />
              </Match>
            </Switch>
          </Card>
        </div>
      </Match>
    </Switch>
  );
}
