// Dated athlete settings: periods of physiological settings with "since" dates. Port of
// dated-athlete-settings-manager + edit-dated-athlete-settings-dialog.
import { createMemo, createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Button, Card, confirm, Dialog, IconButton } from "../../components/ui";
import { fmtDate, isNum } from "../../lib/format";
import { app } from "../../lib/state";
import { toast } from "../../lib/toast";
import type { Athlete, DatedAthleteSettings, MeasureSystem, Num } from "../../lib/types";
import {
  DEFAULT_ATHLETE_SETTINGS,
  fromDraft,
  parseDatedSettingsImport,
  periodUntil,
  runningFtpToPace,
  sortPeriods,
  toDraft,
  today,
  type SettingsDraft
} from "./athlete-model";
import AthleteSettingsForm from "./AthleteSettingsForm";
import { errorMessage } from "./util";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const cell = (v: Num, unit = "") => (isNum(v) ? `${v}${unit}` : "–");

function EditPeriodDialog(props: {
  mode: "add" | "edit";
  period: DatedAthleteSettings;
  otherSinces: (string | null)[];
  system: MeasureSystem;
  onClose: () => void;
  onSave: (p: DatedAthleteSettings) => Promise<boolean>;
}) {
  const [draft, setDraft] = createStore<SettingsDraft>(toDraft(props.period, props.system));
  const [submitted, setSubmitted] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const result = createMemo(() => fromDraft({ ...draft }, props.system, props.otherSinces));
  // Errors show inline as the user types (the draft starts valid).
  const errors = () => result().errors;

  async function submit() {
    setSubmitted(true);
    const s = result().settings;
    if (!s) return;
    setSaving(true);
    try {
      if (await props.onSave(s)) props.onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title={props.mode === "add" ? "Add a settings period" : "Edit settings period"}
      onClose={props.onClose}
      actions={
        <>
          <Show when={submitted() && !result().settings}>
            <span class="field-error spacer">Fix the highlighted fields.</span>
          </Show>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving()} onClick={submit}>
            {props.mode === "add" ? "Add" : "Save changes"}
          </Button>
        </>
      }
    >
      <div class="since-section">
        <Show
          when={draft.since !== null}
          fallback={<p class="form-note">This is the oldest period: it applies to every activity before the other periods ("forever").</p>}
        >
          <div class="form-grid">
            <label class="field">
              <span class="field-label">Settings apply since</span>
              <input
                type="date"
                classList={{ invalid: !!errors().since }}
                value={draft.since ?? ""}
                onInput={e => setDraft("since", e.currentTarget.value)}
              />
              <Show when={errors().since}>
                <span class="field-error">{errors().since}</span>
              </Show>
            </label>
          </div>
        </Show>
      </div>
      <AthleteSettingsForm draft={draft} setDraft={setDraft} errors={errors()} system={props.system} />
    </Dialog>
  );
}

export default function DatedSettingsCard(props: { athlete: Athlete }) {
  const system = () => app.measureSystem();
  const periods = createMemo(() => sortPeriods(props.athlete.datedAthleteSettings));
  const [editing, setEditing] = createSignal<{ mode: "add" | "edit"; period: DatedAthleteSettings; since: string | null } | null>(null);
  const [panel, setPanel] = createSignal<"export" | "import" | null>(null);
  const [importText, setImportText] = createSignal("");

  async function save(next: DatedAthleteSettings[], message: string): Promise<boolean> {
    try {
      await app.saveAthlete({ ...clone(props.athlete), datedAthleteSettings: sortPeriods(next) });
      toast(`${message} Recalculating activities…`);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  }

  function onAdd() {
    const base = clone(periods()[0] ?? { ...DEFAULT_ATHLETE_SETTINGS, since: null });
    setEditing({ mode: "add", period: { ...base, since: today() }, since: null });
  }

  function onSaveDialog(p: DatedAthleteSettings) {
    const e = editing()!;
    if (e.mode === "add") return save([...periods(), p], "Settings period added.");
    return save(
      periods().map(x => (x.since === e.since ? p : x)),
      "Settings period updated."
    );
  }

  async function onRemove(since: string) {
    const ok = await confirm({
      title: "Remove settings period",
      message: `Remove the settings period starting ${fmtDate(since)}? Activities in it will use the previous period.`,
      confirmText: "Remove",
      danger: true
    });
    if (ok) await save(periods().filter(p => p.since !== since), "Settings period removed.");
  }

  async function onReset() {
    const ok = await confirm({
      title: "Reset dated athlete settings",
      message: "Replace all your settings periods with a single default one? Current settings will be lost.",
      confirmText: "Reset",
      danger: true
    });
    if (ok) await save([{ ...clone(DEFAULT_ATHLETE_SETTINGS), since: null }], "Athlete settings reset.");
  }

  async function onImport() {
    let imported: DatedAthleteSettings[];
    try {
      imported = parseDatedSettingsImport(importText());
    } catch (e) {
      toast(errorMessage(e), "error");
      return;
    }
    if (await save(imported, "New settings imported.")) {
      setPanel(null);
      setImportText("");
    }
  }

  const exported = () => JSON.stringify(periods(), null, 2);
  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exported());
      toast("Settings copied to clipboard.");
    } catch {
      toast("Couldn't access the clipboard; select the text and copy it.", "error");
    }
  }

  const otherSinces = () => {
    const e = editing();
    return periods()
      .map(p => p.since)
      .filter(s => e?.mode === "add" || s !== e?.since);
  };

  return (
    <Card
      title="Dated athlete settings"
      actions={
        <>
          <Button small variant="primary" icon="add" onClick={onAdd}>
            Add period
          </Button>
          <IconButton icon="download" label="Export settings" onClick={() => setPanel(panel() === "export" ? null : "export")} />
          <IconButton icon="upload" label="Import settings" onClick={() => setPanel(panel() === "import" ? null : "import")} />
          <IconButton icon="refresh" label="Reset to default" onClick={onReset} />
        </>
      }
    >
      <Show when={panel() === "export"}>
        <div class="io-panel">
          <div class="row">
            <span class="muted small spacer">Your settings periods as JSON. Keep a copy, or paste it into Import later.</span>
            <Button small onClick={copyExport}>
              Copy
            </Button>
          </div>
          <textarea readonly rows={6} value={exported()} onFocus={e => e.currentTarget.select()} />
        </div>
      </Show>
      <Show when={panel() === "import"}>
        <div class="io-panel">
          <span class="muted small">Paste previously exported settings (JSON, or an export from the original Elevate app). This replaces all current periods.</span>
          <textarea rows={6} value={importText()} onInput={e => setImportText(e.currentTarget.value)} placeholder='[{"since": null, "maxHr": 190, ...}]' />
          <div class="row">
            <span class="spacer" />
            <Button small variant="ghost" onClick={() => setPanel(null)}>
              Cancel
            </Button>
            <Button small variant="primary" disabled={!importText().trim()} onClick={onImport}>
              Import
            </Button>
          </div>
        </div>
      </Show>

      <div class="table-wrap">
        <table class="data periods-table">
          <thead>
            <tr>
              <th>Since</th>
              <th>Until</th>
              <th>Weight</th>
              <th>Max HR</th>
              <th>Rest HR</th>
              <th>LTHR</th>
              <th>Cycling LTHR</th>
              <th>Running LTHR</th>
              <th>Cycling FTP</th>
              <th>Running FTP</th>
              <th>Swim FTP</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={periods()}>
              {(p, i) => (
                <tr>
                  <td>{p.since ? fmtDate(p.since, "YYYY-MM-DD") : <span class="muted">Forever</span>}</td>
                  <td>{periodUntil(periods(), i()) ?? <span class="muted">Today</span>}</td>
                  <td>{cell(p.weight, " kg")}</td>
                  <td>{cell(p.maxHr)}</td>
                  <td>{cell(p.restHr)}</td>
                  <td>{cell(p.lthr?.default ?? null)}</td>
                  <td>{cell(p.lthr?.cycling ?? null)}</td>
                  <td>{cell(p.lthr?.running ?? null)}</td>
                  <td>{cell(p.cyclingFtp, " W")}</td>
                  <td>{isNum(p.runningFtp) ? `${runningFtpToPace(p.runningFtp, system())} ${system() === "imperial" ? "/mi" : "/km"}` : "–"}</td>
                  <td>{cell(p.swimFtp, " m/min")}</td>
                  <td class="row-actions">
                    <IconButton icon="edit" label="Edit" onClick={() => setEditing({ mode: "edit", period: clone(p), since: p.since })} />
                    <Show when={p.since !== null} fallback={<span class="icon-btn-spacer" />}>
                      <IconButton icon="delete" label="Delete" onClick={() => onRemove(p.since!)} />
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <details class="settings-hint about-periods">
        <summary>Why dated settings, and how to set them up?</summary>
        <p>
          Activity stats, including stress scores, depend on your physiology (heart rate, weight, power, pace…), which changes
          over time. Each activity is computed with the settings period in effect on its date, so your fitness trend stays
          accurate across years.
        </p>
        <p>
          If you don't know your past values, start with rough ones. Then every 4-6 weeks look at your best 20 min efforts in
          your activities (power for cycling FTP, pace for running and swim FTP, and your max heart rate), and add or update
          periods with them. Activities are recalculated automatically after each change.
        </p>
        <p>
          <strong>Without cycling, running and swim FTPs</strong>, activities recorded without a heart rate monitor or a power
          meter get <strong>no stress score</strong>, which flattens your fitness trend.
        </p>
      </details>

      <Show when={editing()} keyed>
        {e => (
          <EditPeriodDialog
            mode={e.mode}
            period={e.period}
            otherSinces={otherSinces()}
            system={system()}
            onClose={() => setEditing(null)}
            onSave={onSaveDialog}
          />
        )}
      </Show>
    </Card>
  );
}
