// Laps (auto-laps per km/mi served by the detail endpoint); clicking a lap shows it on the map.
import { createMemo, For, Show } from "solid-js";
import { isPaced, isRide, isRun, isSwim, secToMilitary } from "../../lib/format";
import type { Activity, Lap, MeasureSystem } from "../../lib/types";
import {
  CyclingCadenceSensor,
  DistanceSensor,
  ElevationSensor,
  HeartRateSensor,
  PaceSensor,
  RunningCadenceSensor,
  RunningDistanceSensor,
  SpeedSensor,
  SwimDistanceSensor,
  SwimmingCadenceSensor,
  SwimmingPaceSensor,
  type BaseSensor
} from "./shared/sensors";
import type { Range } from "./AnalysisGraph";

const fmt = (sensor: BaseSensor, v: number, ms: MeasureSystem) => `${sensor.formatFromStat(v, ms)} ${sensor.displayUnit(ms) ?? ""}`.trim();

interface Column {
  key: keyof Lap;
  title: string;
  print: (lap: Lap) => string;
}

function columns(a: Activity, ms: MeasureSystem): Column[] {
  const sport = a.type;
  const distance = isSwim(sport) ? SwimDistanceSensor.DEFAULT : isRun(sport) ? RunningDistanceSensor.DEFAULT : DistanceSensor.DEFAULT;
  const cadence = isSwim(sport) ? SwimmingCadenceSensor.DEFAULT : isRun(sport) ? RunningCadenceSensor.DEFAULT : CyclingCadenceSensor.DEFAULT;
  const pace = isSwim(sport) ? SwimmingPaceSensor.DEFAULT : PaceSensor.DEFAULT;
  const cols: Column[] = [
    { key: "id", title: "Lap", print: l => String(l.id) },
    { key: "distance", title: "Distance", print: l => fmt(distance, l.distance!, ms) },
    { key: "movingTime", title: "Moving Time", print: l => secToMilitary(l.movingTime!) },
    { key: "elapsedTime", title: "Elapsed Time", print: l => secToMilitary(l.elapsedTime!) }
  ];
  if (isPaced(sport)) cols.push({ key: "avgPace", title: "Avg Pace", print: l => fmt(pace, l.avgPace!, ms) });
  else {
    cols.push({ key: "avgSpeed", title: "Avg Speed", print: l => fmt(SpeedSensor.DEFAULT, l.avgSpeed!, ms) });
    cols.push({ key: "maxSpeed", title: "Max Speed", print: l => fmt(SpeedSensor.DEFAULT, l.maxSpeed!, ms) });
  }
  cols.push(
    { key: "elevationGain", title: "Elev. Gain", print: l => fmt(ElevationSensor.DEFAULT, l.elevationGain!, ms) },
    { key: "avgCadence", title: "Avg Cadence", print: l => fmt(cadence, l.avgCadence!, ms) },
    { key: "avgHr", title: "Avg HR", print: l => fmt(HeartRateSensor.DEFAULT, l.avgHr!, ms) },
    { key: "maxHr", title: "Max HR", print: l => fmt(HeartRateSensor.DEFAULT, l.maxHr!, ms) },
    { key: "avgWatts", title: isRide(sport) && !a.hasPowerMeter ? "Est. Avg Watts" : "Avg Watts", print: l => `${Math.round(l.avgWatts!)} w` }
  );
  // Only columns at least one lap has a value for.
  return cols.filter(c => a.laps!.some(l => l[c.key] !== undefined && l[c.key] !== null));
}

export function LapsTab(props: { activity: Activity; measureSystem: MeasureSystem; selected: Range | null; onSelect: (r: Range) => void }) {
  const cols = createMemo(() => (props.activity.laps?.length ? columns(props.activity, props.measureSystem) : []));
  const isSelected = (l: Lap) => props.selected?.[0] === l.indexes[0] && props.selected?.[1] === l.indexes[1];
  return (
    <Show when={props.activity.laps?.length} fallback={<div class="muted pad">No laps for this activity.</div>}>
      <div class="table-wrap">
        <table class="data laps-table">
          <thead>
            <tr>
              <For each={cols()}>{c => <th>{c.title}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={props.activity.laps}>
              {lap => (
                <tr
                  class="clickable"
                  classList={{ selected: isSelected(lap), inactive: !lap.active }}
                  title="Show this lap on the map and graph"
                  onClick={() => props.onSelect(lap.indexes)}
                >
                  <For each={cols()}>
                    {c => <td>{lap[c.key] === undefined || lap[c.key] === null ? "-" : c.print(lap)}</td>}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}
