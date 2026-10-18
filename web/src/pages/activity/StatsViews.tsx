// Summary stat tiles and grouped stats panels.
import { createMemo, For, Show } from "solid-js";
import type { Activity, MeasureSystem } from "../../lib/types";
import { sensorColor } from "./shared/colors";
import { displayGroup, displayStat, statsGroups, summaryStats, type StatDisplay } from "./shared/stats";

function StatTile(props: { stat: StatDisplay; large?: boolean; dot?: boolean }) {
  return (
    <div
      class="stat-tile"
      classList={{ large: props.large, missing: props.stat.missing, help: !!props.stat.description }}
      title={props.stat.description ?? undefined}
    >
      <div class="stat-value num">
        {props.stat.value}
        <Show when={props.stat.unit && !props.stat.missing}>
          <span class="stat-unit"> {props.stat.unit}</span>
        </Show>
        <Show when={props.dot && props.stat.sensor}>
          <span class="dot" style={{ background: sensorColor(props.stat.sensor!) }} />
        </Show>
      </div>
      <div class="stat-name">{props.stat.name}</div>
    </div>
  );
}

export function SummaryTiles(props: { activity: Activity; measureSystem: MeasureSystem; compact: boolean }) {
  const stats = createMemo(() => summaryStats(props.activity).map(s => displayStat(s, props.activity, props.measureSystem)));
  return (
    <div class="summary-tiles" classList={{ compact: props.compact }}>
      <For each={stats()}>{s => <StatTile stat={s} large dot />}</For>
    </div>
  );
}

export function StatsPanels(props: { activity: Activity; measureSystem: MeasureSystem }) {
  const groups = createMemo(() =>
    statsGroups(props.activity)
      .map(g => ({ group: g, stats: displayGroup(g, props.activity, props.measureSystem) }))
      .filter(g => g.stats.length)
  );
  return (
    <div class="stats-groups">
      <For each={groups()} fallback={<div class="muted">No stats available for this activity.</div>}>
        {g => (
          <section class="stats-group" style={{ "border-left-color": g.group.sensor ? sensorColor(g.group.sensor) : "var(--border)" }}>
            <h3>{g.group.name}</h3>
            <div class="stats-grid">
              <For each={g.stats}>{s => <StatTile stat={s} />}</For>
            </div>
          </section>
        )}
      </For>
    </div>
  );
}
