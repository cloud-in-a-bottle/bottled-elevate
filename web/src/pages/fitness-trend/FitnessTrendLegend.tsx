// Summary of the viewed day (hovered on the graph, else today).
import { For, Show } from "solid-js";
import { sportName } from "../../lib/format";
import {
  floorTo,
  hasActivities,
  printAthleteSettings,
  printDate,
  printDeltaFatigue,
  printDeltaFitness,
  printDeltaForm,
  printScore,
  trainingZoneName,
  type DayFitnessTrend
} from "./fitness";

const MAX_ACTIVITIES_SHOWN = 2;

function Metric(props: { label: string; value: number; delta: string | null; cls: string; extra?: string }) {
  return (
    <div class={`ft-metric ${props.cls}`}>
      <div class="ft-metric-label">{props.label}</div>
      <div class="ft-metric-value num">
        {floorTo(props.value, 1)}
        <Show when={props.delta}>
          <span class="ft-delta">{props.delta}</span>
        </Show>
      </div>
      <Show when={props.extra}>
        <div class="ft-metric-extra">{props.extra}</div>
      </Show>
    </div>
  );
}

export default function FitnessTrendLegend(props: { day: DayFitnessTrend; zonesEnabled: boolean }) {
  const d = () => props.day;
  const scores = () => {
    const parts: string[] = [];
    if (d().heartRateStressScore) parts.push(`${printScore(d().heartRateStressScore)} HRSS`);
    if (d().trainingImpulseScore) parts.push(`${printScore(d().trainingImpulseScore)} TRIMP`);
    if (d().powerStressScore) parts.push(`${printScore(d().powerStressScore)} PSS`);
    if (d().runningStressScore) parts.push(`${printScore(d().runningStressScore)} RSS`);
    if (d().swimStressScore) parts.push(`${printScore(d().swimStressScore)} SwimSS`);
    return parts.join(" & ");
  };

  return (
    <div class="ft-legend">
      <div class="ft-legend-date">{printDate(d())}</div>
      <div class="ft-legend-activities">
        <Show when={hasActivities(d())} fallback={<i class="muted">{d().previewDay ? "Preview day" : "Rest day"}</i>}>
          <For each={d().activitiesName.slice(0, MAX_ACTIVITIES_SHOWN)}>
            {(name, i) => (
              <span class="ft-activity">
                <span class="ft-tag">{sportName(d().types[i()])}</span>
                <span class="ft-name" title={name}>
                  {name}
                </span>
              </span>
            )}
          </For>
          <Show when={d().activitiesName.length > MAX_ACTIVITIES_SHOWN}>
            <span class="muted">+{d().activitiesName.length - MAX_ACTIVITIES_SHOWN} more</span>
          </Show>
        </Show>
      </div>
      <div class="ft-legend-scores small">
        <Show when={d().finalStressScore} fallback={<i class="faint">No stress score</i>}>
          <span class="muted">{scores()}</span>
          <span>
            {" "}→ <strong>{printScore(d().finalStressScore)}</strong> <span class="muted">stress score</span>
          </span>
        </Show>
      </div>
      <Show when={hasActivities(d()) && printAthleteSettings(d())}>
        <div class="faint small">Calculated with: {printAthleteSettings(d())}</div>
      </Show>
      <div class="ft-metrics">
        <Metric label="Fitness" value={d().ctl} delta={printDeltaFitness(d())} cls="ctl" />
        <Metric label="Fatigue" value={d().atl} delta={printDeltaFatigue(d())} cls="atl" />
        <Metric
          label="Form"
          value={d().tsb}
          delta={printDeltaForm(d())}
          cls="tsb"
          extra={props.zonesEnabled ? `${trainingZoneName(d().trainingZone)} zone` : undefined}
        />
      </div>
    </div>
  );
}
