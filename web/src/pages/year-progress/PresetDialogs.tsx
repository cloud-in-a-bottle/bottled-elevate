// Create a preset (current selection + optional target) and list/load/delete saved presets.
import { createEffect, createSignal, For, Show } from "solid-js";
import { Button, Dialog, Field, IconButton } from "../../components/ui";
import { sportName } from "../../lib/format";
import { ProgressMode, ProgressPreset, YearProgressTypeModel } from "./models";
import { modeLabel, rollingLabel } from "./format";

export interface PresetDraft {
  mode: ProgressMode;
  progressType: YearProgressTypeModel;
  activityTypes: string[];
  includeCommuteRide: boolean;
  includeIndoorRide: boolean;
  rollingPeriod: string;
  periodMultiplier: number;
  targetValue: number | null;
}

export function AddPresetDialog(props: {
  open: boolean;
  draft: PresetDraft;
  onClose: () => void;
  onSave: (targetValue: number | null) => void;
}) {
  const [target, setTarget] = createSignal("");
  createEffect(() => {
    if (props.open) setTarget(props.draft.targetValue ? String(props.draft.targetValue) : "");
  });

  const unit = () => (props.draft.progressType.unit ? ` (${props.draft.progressType.unit})` : "");
  const targetLabel = () =>
    props.draft.mode === ProgressMode.YEAR_TO_DATE
      ? `Target to reach by the end of the year${unit()}`
      : `Target to maintain on ${rollingLabel(props.draft.rollingPeriod, props.draft.periodMultiplier)}${unit()}`;

  const save = () => {
    const v = parseFloat(target());
    props.onSave(Number.isFinite(v) && v > 0 ? v : null);
  };

  return (
    <Dialog
      open={props.open}
      title="Create a preset"
      onClose={props.onClose}
      actions={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Create preset
          </Button>
        </>
      }
    >
      <div class="stack">
        <dl class="yp-summary">
          <dt>Mode</dt>
          <dd>
            {modeLabel(props.draft.mode)}
            <Show when={props.draft.mode === ProgressMode.ROLLING}>
              {" "}
              ({rollingLabel(props.draft.rollingPeriod, props.draft.periodMultiplier)})
            </Show>
          </dd>
          <dt>Progress type</dt>
          <dd>{props.draft.progressType.label}</dd>
          <dt>Sports</dt>
          <dd>{props.draft.activityTypes.map(sportName).join(", ")}</dd>
          <dt>Commutes</dt>
          <dd>{props.draft.includeCommuteRide ? "Included" : "Excluded"}</dd>
          <dt>Indoor</dt>
          <dd>{props.draft.includeIndoorRide ? "Included" : "Excluded"}</dd>
        </dl>
        <Field label={targetLabel()} hint="Leave empty for a preset without target.">
          <input
            type="number"
            min="1"
            value={target()}
            onInput={e => setTarget(e.currentTarget.value)}
            onKeyDown={e => e.key === "Enter" && save()}
          />
        </Field>
      </div>
    </Dialog>
  );
}

export function ManagePresetsDialog(props: {
  open: boolean;
  presets: ProgressPreset[];
  progressTypes: YearProgressTypeModel[];
  onClose: () => void;
  onLoad: (preset: ProgressPreset) => void;
  onDelete: (preset: ProgressPreset) => void;
}) {
  const typeModel = (p: ProgressPreset) => props.progressTypes.find(t => t.type === p.progressType);

  return (
    <Dialog open={props.open} title="Presets & targets" onClose={props.onClose} wide>
      <Show when={props.presets.length > 0} fallback={<div class="muted">No saved presets.</div>}>
        <div class="table-wrap">
          <table class="data yp-presets">
            <thead>
              <tr>
                <th>Mode</th>
                <th>Type</th>
                <th>Sports</th>
                <th>Commute</th>
                <th>Indoor</th>
                <th>Target</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={props.presets}>
                {p => (
                  <tr>
                    <td>
                      {modeLabel(p.mode)}
                      <Show when={p.mode === ProgressMode.ROLLING && p.rollingPeriod}>
                        <div class="small muted">{rollingLabel(p.rollingPeriod!, p.periodMultiplier ?? 1)}</div>
                      </Show>
                    </td>
                    <td>{typeModel(p)?.label ?? "?"}</td>
                    <td class="yp-wrap">{(p.activityTypes ?? []).map(sportName).join(", ")}</td>
                    <td>{p.includeCommuteRide ? "Yes" : "No"}</td>
                    <td>{p.includeIndoorRide ? "Yes" : "No"}</td>
                    <td>{p.targetValue ? `${p.targetValue.toLocaleString()} ${typeModel(p)?.shortUnit ?? ""}` : "-"}</td>
                    <td>
                      <div class="row">
                        <Button small variant="primary" onClick={() => props.onLoad(p)}>
                          Load
                        </Button>
                        <IconButton icon="delete" label="Delete preset" onClick={() => props.onDelete(p)} />
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </Dialog>
  );
}
