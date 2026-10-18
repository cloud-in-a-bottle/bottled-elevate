// Zones settings: pick a zone type, edit its contiguous zones, reset/import/export, then save.
// Port of zones-settings + zone + zone-tool-bar + zones-import-export-dialog.
import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Index, on, Show } from "solid-js";
import { Button, Card, confirm, Dialog, Icon, IconButton, PageHeader, Spinner } from "../../components/ui";
import { app } from "../../lib/state";
import { toast } from "../../lib/toast";
import type { ZoneType } from "../../lib/types";
import { RecomputeNote } from "./AthletePage";
import { errorMessage } from "./util";
import {
  addLastZone,
  DEFAULT_ZONE_TYPE,
  DEFAULT_ZONES,
  deserializeZones,
  parseZonesImport,
  removeLastZone,
  removeZoneAt,
  serializeZones,
  setZoneBound,
  ZONE_DEFINITIONS,
  zoneDefinition,
  zonesError,
  type EditResult,
  type ZoneDefinition,
  type ZoneRange
} from "./zones-model";
import "./settings.css";

const GROUPS = [...new Set(ZONE_DEFINITIONS.map(d => d.group))];

function ZoneTypePicker(props: { value: ZoneType; onChange: (t: ZoneType) => void }) {
  return (
    <>
      <nav class="zone-types">
        <For each={GROUPS}>
          {g => (
            <div class="zone-type-group">
              <div class="zone-type-group-label">{g}</div>
              <For each={ZONE_DEFINITIONS.filter(d => d.group === g)}>
                {d => (
                  <button type="button" classList={{ active: d.value === props.value }} onClick={() => props.onChange(d.value)}>
                    {d.name}
                  </button>
                )}
              </For>
            </div>
          )}
        </For>
      </nav>
      <select class="input zone-type-select" value={props.value} onChange={e => props.onChange(e.currentTarget.value as ZoneType)}>
        <For each={GROUPS}>
          {g => (
            <optgroup label={g}>
              <For each={ZONE_DEFINITIONS.filter(d => d.group === g)}>{d => <option value={d.value}>{d.name}</option>}</For>
            </optgroup>
          )}
        </For>
      </select>
    </>
  );
}

function BoundInput(props: { value: number; step: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  let el!: HTMLInputElement;
  // Only push the value into the DOM when it really changed (e.g. a neighbour moved it), so partial
  // input such as "12." isn't overwritten while typing.
  createEffect(() => {
    const v = props.value;
    if (el.valueAsNumber !== v) el.value = String(v);
  });
  return (
    <input
      ref={el}
      type="number"
      class="zone-input"
      step={props.step}
      min={props.min}
      max={props.max}
      title={`${props.unit}: type a value or use the arrow keys`}
      onInput={e => {
        const v = e.currentTarget.valueAsNumber;
        if (!Number.isNaN(v)) props.onChange(v);
      }}
    />
  );
}

function ImportExportDialog(props: {
  mode: "import" | "export";
  def: ZoneDefinition;
  zones: ZoneRange[];
  onImport: (zones: ZoneRange[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = createSignal(props.mode === "export" ? JSON.stringify(props.zones) : "");
  function doImport() {
    const r = parseZonesImport(text(), props.def);
    if (typeof r === "string") {
      toast(r, "error");
      return;
    }
    props.onImport(r);
    props.onClose();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      toast("Zones copied to clipboard.");
    } catch {
      toast("Couldn't access the clipboard; select the text and copy it.", "error");
    }
  }
  return (
    <Dialog
      open
      title={`${props.mode === "import" ? "Import" : "Export"} ${props.def.name} zones`}
      onClose={props.onClose}
      actions={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Close
          </Button>
          <Show when={props.mode === "export"}>
            <Button variant="primary" onClick={copy}>
              Copy
            </Button>
          </Show>
          <Show when={props.mode === "import"}>
            <Button variant="primary" disabled={!text().trim()} onClick={doImport}>
              Import
            </Button>
          </Show>
        </>
      }
    >
      <p class="muted">
        {props.mode === "import" ? "Paste exported zones below. They replace the current zones (save to apply)." : "Copy this to keep or share your zones."}
      </p>
      <textarea
        class="zones-json"
        rows={6}
        readonly={props.mode === "export"}
        value={text()}
        placeholder='[{ "from": a, "to": b }, { "from": b, "to": c }, { "from": c, "to": d }]'
        onInput={e => setText(e.currentTarget.value)}
        onFocus={e => props.mode === "export" && e.currentTarget.select()}
      />
    </Dialog>
  );
}

export default function ZonesPage() {
  const params = useParams<{ zone?: string }>();
  const navigate = useNavigate();

  const def = createMemo(() => zoneDefinition(params.zone));
  createEffect(() => {
    if (!def()) navigate(`/zones/${DEFAULT_ZONE_TYPE}`, { replace: true });
  });

  const saved = createMemo(() => {
    const s = app.settings();
    const d = def();
    return s && d ? s.zones[d.value] ?? [] : null;
  });

  const [draft, setDraft] = createSignal<ZoneRange[]>([]);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [step, setStep] = createSignal(1);
  const [saving, setSaving] = createSignal(false);
  const [dialog, setDialog] = createSignal<"import" | "export" | null>(null);

  // Load the draft from the saved zones whenever the zone type (or the saved settings) change.
  createEffect(
    on(saved, boundaries => {
      if (!boundaries) return;
      try {
        setDraft(deserializeZones(boundaries));
        setLoadError(null);
      } catch (e) {
        setDraft([]);
        setLoadError(errorMessage(e));
      }
    })
  );
  createEffect(on(def, d => d && setStep(d.step)));

  const error = createMemo(() => zonesError(draft(), def()));
  const dirty = createMemo(() => {
    const s = saved();
    if (!s) return false;
    try {
      return JSON.stringify(serializeZones(draft())) !== JSON.stringify(s);
    } catch {
      return true;
    }
  });

  function apply(r: EditResult) {
    if ("error" in r) toast(r.error, "error");
    else {
      setDraft(r.zones);
      toast(r.message);
    }
  }

  async function selectType(t: ZoneType) {
    if (t === def()?.value) return;
    if (dirty() && !(await confirm({ title: "Discard changes?", message: "Your unsaved zone changes will be lost.", confirmText: "Discard" }))) return;
    navigate(`/zones/${t}`);
  }

  async function save() {
    const s = app.settings();
    const d = def();
    if (!s || !d || error()) return;
    setSaving(true);
    try {
      await app.saveSettings({ ...s, zones: { ...s.zones, [d.value]: serializeZones(draft()) } });
      toast(`${d.name} zones saved. Recalculating activities…`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    const d = def()!;
    const ok = await confirm({
      title: `Reset ${d.name} zones`,
      message: "Replace these zones with the defaults? Save afterwards to apply.",
      confirmText: "Reset"
    });
    if (ok) {
      setDraft(deserializeZones(DEFAULT_ZONES[d.value]));
      toast(`${d.name} zones set to default. Save to apply.`);
    }
  }

  return (
    <div class="settings-page">
      <PageHeader title="Zones settings" />
      <RecomputeNote />
      <Show when={def() && saved()} fallback={<Spinner label="Loading zones…" />}>
        <div class="zones-layout">
          <ZoneTypePicker value={def()!.value} onChange={selectType} />
          <Card
            class="zones-card"
            title={
              <>
                {def()!.name} <span class="muted small">· {draft().length} zones · {def()!.units}</span>
              </>
            }
            actions={
              <>
                <label class="step-field" title="Step used by the arrow keys/spinners, e.g. 0.1, 0.25, 1, 5">
                  <span class="muted small">Step</span>
                  <input type="number" min="0" step="any" value={step()} onInput={e => e.currentTarget.valueAsNumber > 0 && setStep(e.currentTarget.valueAsNumber)} />
                </label>
                <IconButton icon="add" label="Add a last zone" onClick={() => apply(addLastZone(draft()))} />
                <IconButton icon="remove" label="Remove the last zone" onClick={() => apply(removeLastZone(draft()))} />
                <IconButton icon="refresh" label="Reset zones to default" onClick={resetToDefault} />
                <IconButton icon="upload" label="Import zones" onClick={() => setDialog("import")} />
                <IconButton icon="download" label="Export zones" onClick={() => setDialog("export")} />
              </>
            }
          >
            <Show when={loadError()}>
              <div class="banner error">
                <Icon name="warning" />
                {loadError()} Use "Reset zones to default".
              </div>
            </Show>
            <div class="zone-list">
              <div class="zone-row zone-head muted small">
                <span />
                <span>From</span>
                <span>To</span>
                <span />
              </div>
              <Index each={draft()}>
                {(zone, i) => (
                  <div class="zone-row" classList={{ invalid: zone().from >= zone().to }}>
                    <span class="zone-id">Z{i + 1}</span>
                    <div class="zone-bound">
                      <BoundInput
                        value={zone().from}
                        step={step()}
                        min={i === 0 ? def()!.min : draft()[i - 1]?.from ?? def()!.min}
                        max={zone().to}
                        unit={def()!.units}
                        onChange={v => setDraft(setZoneBound(draft(), i, "from", v))}
                      />
                      <Show when={def()!.customDisplay}>
                        <span class="zone-custom muted small">{def()!.customDisplay!(zone().from)}</span>
                      </Show>
                    </div>
                    <div class="zone-bound">
                      <BoundInput
                        value={zone().to}
                        step={step()}
                        min={zone().from}
                        max={i === draft().length - 1 ? def()!.max : draft()[i + 1]?.to ?? def()!.max}
                        unit={def()!.units}
                        onChange={v => setDraft(setZoneBound(draft(), i, "to", v))}
                      />
                      <Show when={def()!.customDisplay}>
                        <span class="zone-custom muted small">{def()!.customDisplay!(zone().to)}</span>
                      </Show>
                    </div>
                    <IconButton icon="close" label={`Remove zone ${i + 1}`} onClick={() => apply(removeZoneAt(draft(), i))} />
                  </div>
                )}
              </Index>
            </div>
            <p class="form-note">Changing a bound also moves the matching bound of the neighbouring zone, so zones stay contiguous.</p>
            <div class="zones-save-bar">
              <Show when={error()}>
                <span class="field-error">{error()}</span>
              </Show>
              <Show when={!error() && dirty()}>
                <span class="muted">Unsaved changes</span>
              </Show>
              <span class="spacer" />
              <Button variant="ghost" disabled={!dirty() || saving()} onClick={() => saved() && setDraft(deserializeZones(saved()!))}>
                Discard
              </Button>
              <Button variant="primary" icon="check" disabled={!dirty() || !!error() || saving()} onClick={save}>
                Save zones
              </Button>
            </div>
          </Card>
        </div>
        <Show when={dialog()} keyed>
          {mode => (
            <ImportExportDialog
              mode={mode}
              def={def()!}
              zones={draft()}
              onImport={z => {
                setDraft(z);
                toast("Zones imported. Save to apply.");
              }}
              onClose={() => setDialog(null)}
            />
          )}
        </Show>
      </Show>
    </div>
  );
}
