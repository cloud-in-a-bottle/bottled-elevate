// Period selection (presets or custom from/to) and the data source toggles.
import { For } from "solid-js";
import { Field, Switch } from "../../components/ui";
import type { HeartRateImpulseMode } from "./fitness";
import type { LastPeriod, Period } from "./periods";

export interface Toggles {
  trainingZones: boolean;
  powerMeter: boolean;
  swim: boolean;
  eBikeRides: boolean;
}

export interface InputsProps {
  period: Period;
  lastPeriods: LastPeriod[];
  dateMin: string;
  dateMax: string;
  mode: HeartRateImpulseMode;
  toggles: Toggles;
  allowEstimatedPss: boolean;
  allowEstimatedRss: boolean;
  onPeriod: (p: Period) => void;
  onToggle: (key: keyof Toggles, value: boolean) => void;
  onEstimatedPss: (v: boolean) => void;
  onEstimatedRss: (v: boolean) => void;
}

const TRIMP_HINT = "Disabled when the heart rate stress mode is TRIMP: TRIMP isn't on the same scale. Switch to HRSS in the settings.";

export default function FitnessTrendInputs(props: InputsProps) {
  const trimp = () => props.mode === "TRIMP";

  const onPreset = (key: string) => {
    const p = props.lastPeriods.find(lp => lp.key === key);
    if (p) props.onPeriod({ from: p.from, to: p.to, key: p.key });
  };

  return (
    <div class="ft-inputs">
      <div class="ft-period">
        <Field label="Last">
          <select onChange={e => onPreset(e.currentTarget.value)}>
            <option value="" disabled selected={!props.period.key}>
              Custom
            </option>
            <For each={props.lastPeriods}>{p => (
                <option value={p.key} selected={p.key === props.period.key}>
                  {p.label}
                </option>
              )}</For>
          </select>
        </Field>
        <Field label="From">
          <input
            type="date"
            value={props.period.from}
            min={props.dateMin}
            max={props.period.to}
            onChange={e => {
              const v = e.currentTarget.value;
              if (v && v < props.period.to) props.onPeriod({ ...props.period, from: v < props.dateMin ? props.dateMin : v, key: null });
              else e.currentTarget.value = props.period.from;
            }}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={props.period.to}
            min={props.period.from}
            max={props.dateMax}
            onChange={e => {
              const v = e.currentTarget.value;
              if (v && v > props.period.from) props.onPeriod({ ...props.period, to: v > props.dateMax ? props.dateMax : v, key: null });
              else e.currentTarget.value = props.period.to;
            }}
          />
        </Field>
      </div>
      <div class="ft-toggles">
        <Switch
          label="Training zones"
          checked={props.toggles.trainingZones && !trimp()}
          disabled={trimp()}
          title={trimp() ? TRIMP_HINT : "Show training zones (form ranges)"}
          onChange={v => props.onToggle("trainingZones", v)}
        />
        <Switch
          label="Power meter"
          checked={props.toggles.powerMeter && !trimp()}
          disabled={trimp()}
          title={
            trimp()
              ? TRIMP_HINT
              : "Use cycling power stress scores (PSS) when available. Requires a cycling FTP in athlete settings."
          }
          onChange={v => props.onToggle("powerMeter", v)}
        />
        <Switch
          label="Est. power"
          checked={props.toggles.powerMeter && props.allowEstimatedPss && !trimp()}
          disabled={trimp() || !props.toggles.powerMeter}
          title={
            trimp()
              ? TRIMP_HINT
              : props.toggles.powerMeter
                ? "Use PSS computed from estimated power on rides without a power meter"
                : "Enable power meter data first"
          }
          onChange={v => props.onEstimatedPss(v)}
        />
        <Switch
          label="Est. running"
          checked={props.allowEstimatedRss && !trimp()}
          disabled={trimp()}
          title={
            trimp()
              ? TRIMP_HINT
              : "Use running stress scores (RSS) estimated from grade adjusted pace. Requires a running threshold pace in athlete settings."
          }
          onChange={v => props.onEstimatedRss(v)}
        />
        <Switch
          label="Swim"
          checked={props.toggles.swim && !trimp()}
          disabled={trimp()}
          title={trimp() ? TRIMP_HINT : "Use swim stress scores (SSS). Requires a swim threshold pace in athlete settings."}
          onChange={v => props.onToggle("swim", v)}
        />
        <Switch
          label="E-bike rides"
          checked={props.toggles.eBikeRides}
          title="Include electrically assisted rides"
          onChange={v => props.onToggle("eBikeRides", v)}
        />
      </div>
    </div>
  );
}
