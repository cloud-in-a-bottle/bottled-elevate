// Physiological settings of one dated period: weight, heart rates, LTHR, FTPs (with the swim FTP
// calculator). Port of athlete-settings-form + swim-ftp-helper; values are validated by the parent
// through fromDraft() rather than reset field by field.
import { createEffect, createSignal, For, JSX, Show } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { Field, Switch } from "../../components/ui";
import { paceUnit } from "../../lib/format";
import type { MeasureSystem } from "../../lib/types";
import {
  computeSwimFtp,
  convertPaceToSwimSpeed,
  DEFAULT_LTHR_KARVONEN_HRR_FACTOR,
  karvonenLthr,
  minSec,
  parseDuration,
  paceToRunningFtp,
  runningFtpToPace,
  SWIM_CALCULATION_METHODS,
  type DraftErrors,
  type SettingsDraft
} from "./athlete-model";

function Hint(props: { summary: string; children: JSX.Element }) {
  return (
    <details class="settings-hint">
      <summary>{props.summary}</summary>
      <div>{props.children}</div>
    </details>
  );
}

function NumberInput(props: {
  value: string;
  onInput: (v: string) => void;
  error?: string;
  placeholder?: string;
  step?: string;
  unit?: string;
}) {
  let el!: HTMLInputElement;
  // Write to the DOM only on real changes so partial input ("70.") isn't clobbered while typing.
  createEffect(() => {
    const v = props.value;
    if (el.value !== v) el.value = v;
  });
  return (
    <div class="input-with-unit">
      <input
        ref={el}
        type="number"
        min="0"
        step={props.step ?? "any"}
        classList={{ invalid: !!props.error }}
        placeholder={props.placeholder}
        onInput={e => props.onInput(e.currentTarget.value)}
      />
      <Show when={props.unit}>
        <span class="unit">{props.unit}</span>
      </Show>
    </div>
  );
}

const ErrorText = (props: { error?: string }) => (
  <Show when={props.error}>
    <span class="field-error">{props.error}</span>
  </Show>
);

export default function AthleteSettingsForm(props: {
  draft: SettingsDraft;
  setDraft: SetStoreFunction<SettingsDraft>;
  errors: DraftErrors;
  system: MeasureSystem;
}) {
  const set = (key: keyof SettingsDraft) => (v: string) => props.setDraft(key, v);

  const defaultLthr = () => {
    const max = Number(props.draft.maxHr);
    const rest = Number(props.draft.restHr);
    return max > 0 && rest > 0 ? Math.round(karvonenLthr(max, rest)) : null;
  };

  // Running threshold pace shown in the other unit system too.
  const otherSystem = (): MeasureSystem => (props.system === "metric" ? "imperial" : "metric");
  const runningOther = () => {
    const ftp = paceToRunningFtp(props.draft.runningPace, props.system);
    return ftp && !Number.isNaN(ftp) ? `${runningFtpToPace(ftp, otherSystem())} ${paceUnit(otherSystem())}` : "";
  };

  // Swim FTP: m/min, or equivalently a pace per 100m; both inputs stay in sync.
  const paceOf = (mPerMin: string) => {
    const v = Number(mPerMin);
    return mPerMin.trim() && v > 0 ? minSec(6000 / v) : "";
  };
  const [swimPace, setSwimPace] = createSignal(paceOf(props.draft.swimFtp));
  const [swimPaceError, setSwimPaceError] = createSignal<string>();
  const onSwimFtp = (v: string) => {
    props.setDraft("swimFtp", v);
    setSwimPace(paceOf(v));
    setSwimPaceError(undefined);
  };
  const onSwimPace = (v: string) => {
    setSwimPace(v);
    if (!v.trim()) {
      props.setDraft("swimFtp", "");
      setSwimPaceError(undefined);
      return;
    }
    const secs = parseDuration(v);
    if (secs === null || secs <= 0) {
      setSwimPaceError("Enter a pace like 1:45");
      return;
    }
    setSwimPaceError(undefined);
    props.setDraft("swimFtp", String(convertPaceToSwimSpeed(v)));
  };

  // Swim FTP calculator.
  const [calcOpen, setCalcOpen] = createSignal(false);
  const [calcMethod, setCalcMethod] = createSignal(0);
  const [calcParams, setCalcParams] = createSignal<string[]>([]);
  const runCalc = () => {
    const method = SWIM_CALCULATION_METHODS[calcMethod()];
    const params = method.params.map((_, i) => Number(calcParams()[i]));
    if (params.some(p => !(p > 0))) return;
    const ftp = computeSwimFtp(method, params);
    if (ftp !== null) onSwimFtp(String(ftp));
  };

  return (
    <div class="athlete-form">
      <section class="form-section">
        <h3>Body</h3>
        <div class="form-grid">
          <Field label="Weight">
            <NumberInput value={props.draft.weight} onInput={set("weight")} step="0.1" unit="kg" error={props.errors.weight} />
            <ErrorText error={props.errors.weight} />
          </Field>
        </div>
      </section>

      <section class="form-section">
        <h3>Heart rate</h3>
        <div class="form-grid">
          <Field label="Max heart rate">
            <NumberInput value={props.draft.maxHr} onInput={set("maxHr")} unit="bpm" error={props.errors.maxHr} />
            <ErrorText error={props.errors.maxHr} />
          </Field>
          <Field label="Rest heart rate">
            <NumberInput value={props.draft.restHr} onInput={set("restHr")} unit="bpm" error={props.errors.restHr} />
            <ErrorText error={props.errors.restHr} />
          </Field>
        </div>
        <Hint summary="How to set up max heart rate">
          Enter your max heart rate measured at full throttle. If you don't know it, enter "220 − your age" as a
          temporary value and measure it for real later.
        </Hint>
        <Hint summary="How to set up rest heart rate">
          Lie down in bed and measure the lowest value with a heart rate monitor.
        </Hint>

        <h4>Lactate threshold heart rate (LTHR)</h4>
        <div class="form-grid">
          <Field label="Default LTHR">
            <NumberInput
              value={props.draft.lthrDefault}
              onInput={set("lthrDefault")}
              unit="bpm"
              placeholder={defaultLthr() ? `${defaultLthr()} (85% HRR)` : ""}
              error={props.errors.lthrDefault}
            />
            <ErrorText error={props.errors.lthrDefault} />
          </Field>
          <Field label="Cycling LTHR">
            <NumberInput
              value={props.draft.lthrCycling}
              onInput={set("lthrCycling")}
              unit="bpm"
              placeholder="Uses default"
              error={props.errors.lthrCycling}
            />
            <ErrorText error={props.errors.lthrCycling} />
          </Field>
          <Field label="Running LTHR">
            <NumberInput
              value={props.draft.lthrRunning}
              onInput={set("lthrRunning")}
              unit="bpm"
              placeholder="Uses default"
              error={props.errors.lthrRunning}
            />
            <ErrorText error={props.errors.lthrRunning} />
          </Field>
        </div>
        <Show when={!props.draft.lthrDefault.trim() && defaultLthr()}>
          <p class="form-note">
            No default LTHR is set, so <strong>{defaultLthr()} bpm</strong> is used: {DEFAULT_LTHR_KARVONEN_HRR_FACTOR * 100}% of
            your heart rate reserve (Karvonen method).
          </p>
        </Show>
        <Hint summary="How to set up LTHR">
          The LTHR is the point above which blood acidification increases and endurance performance drops quickly. To find
          it, ride or run a 30 minute time trial <strong>alone</strong>, as if it were a race. Start measuring your heart
          rate 10 minutes in; your average heart rate over the last 20 minutes is your LTHR.
        </Hint>
      </section>

      <section class="form-section">
        <h3>Functional thresholds</h3>
        <div class="form-grid">
          <Field label="Cycling FTP">
            <NumberInput value={props.draft.cyclingFtp} onInput={set("cyclingFtp")} unit="W" error={props.errors.cyclingFtp} />
            <ErrorText error={props.errors.cyclingFtp} />
          </Field>
          <Field label="Running threshold pace" hint={runningOther()}>
            <div class="input-with-unit">
              <input
                type="text"
                inputmode="numeric"
                placeholder="m:ss"
                classList={{ invalid: !!props.errors.runningPace }}
                value={props.draft.runningPace}
                onInput={e => props.setDraft("runningPace", e.currentTarget.value)}
              />
              <span class="unit">{paceUnit(props.system)}</span>
            </div>
            <ErrorText error={props.errors.runningPace} />
          </Field>
        </div>
        <Hint summary="How to set up cycling FTP">
          The FTP is the average power you can hold for one hour. To estimate it, ride a 20 minute all-out test and multiply
          the average power by 0.95 (e.g. 200 W gives an FTP of 190 W). Re-test every 4 to 6 weeks; the "Best 20 min power"
          stat of your activities helps track it.
        </Hint>
        <Hint summary="How to set up running threshold pace">
          The maximal pace you can hold for about 45-60 minutes. Take a recent race or hard run of 10-15 km: if your 10 km
          took more than 45 min use your average 10 km pace, otherwise your average 15 km or half marathon pace.{" "}
          <a href="https://www.trainingpeaks.com/blog/determining-functional-threshold-pace-ftp/" target="_blank" rel="noreferrer">
            Learn more
          </a>
          .
        </Hint>

        <h4>Swimming threshold pace</h4>
        <div class="form-grid">
          <Field label="Swim FTP (speed)">
            <NumberInput value={props.draft.swimFtp} onInput={onSwimFtp} step="0.1" unit="m/min" error={props.errors.swimFtp} />
            <ErrorText error={props.errors.swimFtp} />
          </Field>
          <Field label="or as pace">
            <div class="input-with-unit">
              <input
                type="text"
                inputmode="numeric"
                placeholder="m:ss"
                classList={{ invalid: !!swimPaceError() }}
                value={swimPace()}
                onChange={e => onSwimPace(e.currentTarget.value)}
              />
              <span class="unit">/100m</span>
            </div>
            <ErrorText error={swimPaceError()} />
          </Field>
        </div>
        <Switch checked={calcOpen()} onChange={setCalcOpen} label="Swim FTP calculator" />
        <Show when={calcOpen()}>
          <div class="swim-calc">
            <p class="form-note">
              Pick a test method and enter its results; your swim FTP is computed from them.{" "}
              <a href="https://www.trainingpeaks.com/blog/calculating-swimming-tss-score/" target="_blank" rel="noreferrer">
                Learn more
              </a>
            </p>
            <For each={SWIM_CALCULATION_METHODS}>
              {(method, i) => (
                <div class="swim-method" classList={{ active: calcMethod() === i() }}>
                  <label class="radio">
                    <input
                      type="radio"
                      name="swim-method"
                      checked={calcMethod() === i()}
                      onChange={() => {
                        setCalcMethod(i());
                        setCalcParams([]);
                      }}
                    />
                    {method.name}
                  </label>
                  <Show when={calcMethod() === i()}>
                    <For each={method.params}>
                      {(hint, p) => (
                        <Field label={hint}>
                          <input
                            type="number"
                            min="0"
                            value={calcParams()[p()] ?? ""}
                            onInput={e => {
                              const next = [...calcParams()];
                              next[p()] = e.currentTarget.value;
                              setCalcParams(next);
                              runCalc();
                            }}
                          />
                        </Field>
                      )}
                    </For>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>
    </div>
  );
}
