// Global settings: units, plus data maintenance (sync, recalculate, resets).
import { JSX, Show } from "solid-js";
import { Button, Card, confirm, PageHeader, Segmented, Spinner, type IconName } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { app } from "../../lib/state";
import { toast } from "../../lib/toast";
import type { MeasureSystem, Temperature, UserSettings } from "../../lib/types";
import { errorMessage } from "./util";
import "./settings.css";

function SettingRow(props: { title: string; description: JSX.Element; children: JSX.Element }) {
  return (
    <div class="setting-row">
      <div class="setting-text">
        <div class="setting-title">{props.title}</div>
        <div class="muted small">{props.description}</div>
      </div>
      <div class="setting-control">{props.children}</div>
    </div>
  );
}

function ActionRow(props: {
  title: string;
  description: JSX.Element;
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <SettingRow title={props.title} description={props.description}>
      <Button small icon={props.icon} variant={props.danger ? "danger" : "secondary"} disabled={props.disabled} onClick={props.onClick}>
        {props.label}
      </Button>
    </SettingRow>
  );
}

async function run(action: () => Promise<unknown>, message: string) {
  try {
    await action();
    toast(message);
  } catch (e) {
    toast(errorMessage(e), "error");
  }
}

export default function GlobalSettingsPage() {
  const busy = () => !!app.status()?.running;

  const update = (patch: Partial<UserSettings>) => {
    const s = app.settings();
    if (s) void run(() => app.saveSettings({ ...s, ...patch }), "Settings saved");
  };

  async function syncAll() {
    await run(() => app.sync("full"), "Syncing all workouts…");
  }

  async function recalculateAll() {
    await run(async () => {
      await api.recalculateAll();
      app.pollSoon();
    }, "Recalculating all activities…");
  }

  async function resetAthlete() {
    const ok = await confirm({
      title: "Reset athlete settings",
      message: "Reset your athlete profile and every dated settings period to the defaults? All activities will be recalculated.",
      confirmText: "Reset athlete settings",
      danger: true
    });
    if (ok) await run(() => app.resetAthlete(), "Athlete settings reset. Recalculating activities…");
  }

  async function resetSettings() {
    const ok = await confirm({
      title: "Reset settings to defaults",
      message: "Reset units and all zones to their defaults? All activities will be recalculated.",
      confirmText: "Reset settings",
      danger: true
    });
    if (ok) await run(() => app.resetSettings(), "Settings reset. Recalculating activities…");
  }

  async function forceResync() {
    const ok = await confirm({
      title: "Clear and re-sync everything?",
      message: (
        <>
          <p>
            This <strong>deletes every stored activity</strong>, including your edits (names, types, notes, commute/trainer
            flags), then downloads and recomputes all workouts from scratch. It can take a long time.
          </p>
          <p>Your athlete settings, zones and preferences are kept. This cannot be undone.</p>
        </>
      ),
      confirmText: "Delete activities and re-sync",
      danger: true
    });
    if (ok) await run(() => app.sync("force"), "Clearing activities and re-syncing…");
  }

  return (
    <div class="settings-page">
      <PageHeader title="Settings" />
      <Show when={app.settings()} fallback={<Spinner label="Loading settings…" />}>
        {settings => (
          <div class="stack">
            <Card title="Units">
              <SettingRow title="Measure system" description="Units for distances, speeds, paces and elevations across the app.">
                <Segmented<MeasureSystem>
                  value={settings().systemUnit}
                  options={[
                    { value: "metric", label: "Metric" },
                    { value: "imperial", label: "Imperial" }
                  ]}
                  onChange={v => update({ systemUnit: v })}
                />
              </SettingRow>
              <SettingRow title="Temperature" description="Unit for temperatures.">
                <Segmented<Temperature>
                  value={settings().temperatureUnit}
                  options={[
                    { value: "C", label: "°C" },
                    { value: "F", label: "°F" }
                  ]}
                  onChange={v => update({ temperatureUnit: v })}
                />
              </SettingRow>
            </Card>

            <Card title="Data">
              <p class="muted small data-status">
                <Show when={app.status()} fallback="…">
                  {s => (
                    <>
                      {s().activities} activities stored
                      <Show when={s().lastSyncTime}> · last synced {fmtDateTime(s().lastSyncTime!)}</Show>
                      <Show when={s().running}> · {s().job === "recompute" ? "recalculating" : "syncing"} now…</Show>
                    </>
                  )}
                </Show>
              </p>
              <ActionRow
                title="Sync all workouts"
                description="Fetch every workout from your health data, not just recent ones. New and changed workouts are imported."
                label="Sync all"
                icon="sync"
                disabled={busy()}
                onClick={syncAll}
              />
              <ActionRow
                title="Recalculate all activities"
                description="Recompute every activity's stats with your current athlete settings and zones. This normally happens automatically when you change them."
                label="Recalculate"
                icon="refresh"
                disabled={busy()}
                onClick={recalculateAll}
              />
              <ActionRow
                title="Reset athlete settings"
                description="Restore the default athlete profile and a single default settings period."
                label="Reset athlete"
                danger
                onClick={resetAthlete}
              />
              <ActionRow
                title="Reset settings to defaults"
                description="Restore default units and zones."
                label="Reset settings"
                danger
                onClick={resetSettings}
              />
              <ActionRow
                title="Clear & re-sync everything"
                description="Delete all stored activities (and your edits to them) and import everything again from scratch."
                label="Clear & re-sync"
                icon="delete"
                danger
                disabled={busy()}
                onClick={forceResync}
              />
            </Card>
          </div>
        )}
      </Show>
    </div>
  );
}
