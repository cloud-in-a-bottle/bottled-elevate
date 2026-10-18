// Fitness trend dialogs: configuration, help (condensed user guide), activity links, athlete settings.
import { A } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { Button, Dialog, Field, Segmented, Switch } from "../../components/ui";
import { toast } from "../../lib/toast";
import {
  formatPatternsForStorage,
  printAthleteSettings,
  printDate,
  type DayFitnessTrend,
  type FitnessTrendConfig
} from "./fitness";

export function ConfigDialog(props: {
  open: boolean;
  config: FitnessTrendConfig;
  powerMeterEnabled: boolean;
  lastActiveDate: string | null;
  onClose: () => void;
  onSave: (c: FitnessTrendConfig) => void;
}) {
  const [draft, setDraft] = createSignal<FitnessTrendConfig>(structuredClone(props.config));
  const [patterns, setPatterns] = createSignal("");

  // Reset the draft each time the dialog opens.
  createEffect(() => {
    if (props.open) {
      setDraft(structuredClone(props.config));
      setPatterns((props.config.ignoreActivityNamePatterns ?? []).join("\n"));
    }
  });

  const set = (patch: Partial<FitnessTrendConfig>) => setDraft({ ...draft(), ...patch });
  const hrss = () => draft().heartRateImpulseMode === "HRSS";
  const estPssEnabled = () => props.powerMeterEnabled && hrss();

  const setInitial = (key: "ctl" | "atl", raw: string) => {
    let v: number | null = raw === "" ? null : Number(raw);
    if (v !== null && (!Number.isFinite(v) || v < 0)) {
      v = null;
      toast("Invalid value entered. Reset to default value.");
    }
    set({ initializedFitnessTrendModel: { ...draft().initializedFitnessTrendModel, [key]: v } });
  };

  const save = () => {
    props.onSave({ ...draft(), ignoreActivityNamePatterns: formatPatternsForStorage(patterns()) });
  };

  return (
    <Dialog
      open={props.open}
      title="Fitness trend settings"
      onClose={() => props.onClose()}
      wide
      actions={
        <>
          <Button variant="ghost" onClick={() => props.onClose()}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div class="stack ft-config">
        <section>
          <h3>Heart rate stress score mode</h3>
          <p class="muted small">How stress scores are computed from heart rate data.</p>
          <Segmented
            options={[
              { value: "HRSS", label: "HRSS (recommended)" },
              { value: "TRIMP", label: "TRIMP" }
            ]}
            value={draft().heartRateImpulseMode}
            onChange={v => set({ heartRateImpulseMode: v })}
          />
          <Show when={!hrss()}>
            <div class="ft-warning small">
              With TRIMP, training zones are disabled and power (PSS), running (RSS) and swim (SSS) stress scores are
              ignored, because TRIMP scores are not on the same scale.
            </div>
          </Show>
        </section>

        <section>
          <h3>Estimated stress scores</h3>
          <p class="muted small">For workouts recorded without a heart rate monitor or power meter.</p>
          <div class="stack" style={{ gap: "10px" }}>
            <Switch
              label="Cycling: use estimated power stress scores (PSS)"
              checked={draft().allowEstimatedPowerStressScore}
              disabled={!estPssEnabled()}
              onChange={v => set({ allowEstimatedPowerStressScore: v })}
            />
            <Show when={!estPssEnabled()}>
              <div class="field-hint">
                Needs the HRSS mode and the "Power meter" toggle on. PSS also needs a cycling FTP in{" "}
                <A href="/athlete" onClick={() => props.onClose()}>
                  athlete settings
                </A>
                .
              </div>
            </Show>
            <Switch
              label="Running: use estimated running stress scores (RSS)"
              checked={draft().allowEstimatedRunningStressScore}
              disabled={!hrss()}
              onChange={v => set({ allowEstimatedRunningStressScore: v })}
            />
            <div class="field-hint">
              RSS needs a running threshold pace in{" "}
              <A href="/athlete" onClick={() => props.onClose()}>
                athlete settings
              </A>
              {hrss() ? "." : " and the HRSS mode."}
            </div>
          </div>
        </section>

        <section>
          <h3>Exclude activities by name</h3>
          <p class="muted small">
            One pattern per line, case sensitive. Activities whose name contains a pattern are ignored, e.g. tag
            downhill MTB rides with "#MTBDH" so their ski-lift elevation doesn't inflate estimated stress scores.
          </p>
          <textarea rows={4} value={patterns()} onInput={e => setPatterns(e.currentTarget.value)} placeholder="#MTBDH" />
        </section>

        <section class="ft-config-grid">
          <Field label="Ignore activities before" hint="Leave empty for no exclusion. Useful to drop previous seasons.">
            <input
              type="date"
              value={draft().ignoreBeforeDate ?? ""}
              max={props.lastActiveDate ?? undefined}
              onChange={e => set({ ignoreBeforeDate: e.currentTarget.value || null })}
            />
          </Field>
          <Field label="Starting fitness" hint="Empty means 0">
            <input
              type="number"
              min="0"
              value={draft().initializedFitnessTrendModel.ctl ?? ""}
              onChange={e => setInitial("ctl", e.currentTarget.value)}
            />
          </Field>
          <Field label="Starting fatigue" hint="Empty means 0">
            <input
              type="number"
              min="0"
              value={draft().initializedFitnessTrendModel.atl ?? ""}
              onChange={e => setInitial("atl", e.currentTarget.value)}
            />
          </Field>
        </section>
      </div>
    </Dialog>
  );
}

export function HelpDialog(props: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={props.open} title="About the fitness trend" onClose={() => props.onClose()} wide>
      <div class="ft-help">
        <p>
          The fitness trend models how your body responds to training over time. Each workout is quantified as a{" "}
          <b>stress score</b>, which acts as an impulse that adds both <b class="ctl">fitness</b> and{" "}
          <b class="atl">fatigue</b>. Fatigue builds up and fades faster than fitness. Your <b class="tsb">form</b>{" "}
          is yesterday's fitness minus yesterday's fatigue. This is also known as a Performance Management Chart
          (CTL / ATL / TSB).
        </p>
        <pre class="ft-formula">
          Fitness(day) = Fitness(day-1) + (Stress(day) − Fitness(day-1)) × (1 − e^(−1/42)){"\n"}
          Fatigue(day) = Fatigue(day-1) + (Stress(day) − Fatigue(day-1)) × (1 − e^(−1/7)){"\n"}
          Form(day) = Fitness(day-1) − Fatigue(day-1)
        </pre>

        <h3>Stress scores</h3>
        <ul>
          <li>
            <b>HRSS</b> (Heart Rate Stress Score): heart-rate based, scaled to your lactate threshold heart rate
            (LTHR) so one hour at LTHR = 100. Close to TrainingPeaks' hrTSS. Recommended heart rate mode.
          </li>
          <li>
            <b>TRIMP</b> (Training Impulse): duration × heart rate reserve intensity. Not scaled to your threshold,
            so it can't be mixed with the other scores or used with training zones.
          </li>
          <li>
            <b>PSS</b> (Power Stress Score): from normalized power, duration and your cycling FTP (= TSS). Needs a
            power meter, or estimated power if enabled in settings.
          </li>
          <li>
            <b>RSS</b> (Running Stress Score): from grade adjusted pace, duration and your running threshold pace
            (≈ rTSS). Optional, for runs without heart rate.
          </li>
          <li>
            <b>SSS</b> (Swim Stress Score): from swim distance, active time and your swim threshold pace (≈ sTSS).
          </li>
        </ul>
        <p class="muted">
          When a workout has several scores, the one used is, by priority: PSS with a power meter, HRSS, TRIMP,
          estimated PSS, RSS, then SSS. Scores of the same day add up. Thresholds (FTP, LTHR, …) are taken from your
          dated athlete settings at the time of each workout.
        </p>

        <h3>Training zones (by form)</h3>
        <ul class="ft-zones-list">
          <li>
            <b>Transition</b> (above +25): extended break: illness, injury, off-season.
          </li>
          <li>
            <b>Freshness</b> (+5 to +25): fresh and on form; ready for a race or big day.
          </li>
          <li>
            <b>Neutral</b> (−10 to +5): typical of a rest or recovery week.
          </li>
          <li>
            <b>Optimal</b> (−30 to −10): productive training, building fitness.
          </li>
          <li>
            <b>Overload</b> (below −30): over-training risk; consider resting.
          </li>
        </ul>

        <h3>Using the chart</h3>
        <ul>
          <li>Hover a day to see its details; click a day with activities to open them.</li>
          <li>
            Dashed lines preview the next 14 days assuming rest. Dots on the zero line mark active days.
          </li>
          <li>Keyboard: ← / → move the period by 14 days, ↑ / ↓ zoom in / out.</li>
        </ul>
      </div>
    </Dialog>
  );
}

export function ActivitiesDialog(props: { day: DayFitnessTrend | null; onClose: () => void }) {
  return (
    <Dialog open={!!props.day} title={props.day ? printDate(props.day) : ""} onClose={() => props.onClose()}>
      <div class="ft-activity-links">
        <For each={props.day?.ids ?? []}>
          {(id, i) => (
            <A href={`/activity/${encodeURIComponent(id)}`} onClick={() => props.onClose()}>
              <span class="ft-tag">{props.day!.types[i()]}</span>
              {props.day!.activitiesName[i()]}
            </A>
          )}
        </For>
      </div>
    </Dialog>
  );
}

export function SettingsInfoDialog(props: { day: DayFitnessTrend | null; onClose: () => void }) {
  return (
    <Dialog open={!!props.day} title="Calculated with athlete settings" onClose={() => props.onClose()}>
      <p class="muted small">{props.day ? printDate(props.day) : ""}</p>
      <p>{props.day ? printAthleteSettings(props.day) : ""}</p>
    </Dialog>
  );
}
