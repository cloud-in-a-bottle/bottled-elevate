// Shown while there are no activities yet: loading, first sync in progress, or nothing synced.
import { Match, Show, Switch } from "solid-js";
import { Button, Card, EmptyState, Spinner } from "../../components/ui";
import { app } from "../../lib/state";

export function SyncRequired() {
  const status = app.status;
  const pct = () => {
    const s = status();
    return s && s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
  };

  return (
    <Switch fallback={<Spinner label="Loading activities…" />}>
      <Match when={status()?.running}>
        <Card title="Importing your workouts">
          <div class="act-first-sync">
            <div class="muted">
              <Show when={status()!.total > 0} fallback="Listing workouts from your health data…">
                {status()!.done} of {status()!.total} workouts processed ({pct()}%). Activities will show up here as they are imported.
              </Show>
            </div>
            <div class="act-progress">
              <div classList={{ indeterminate: !status()!.total }} style={{ width: status()!.total ? `${pct()}%` : "30%" }} />
            </div>
          </div>
        </Card>
      </Match>
      <Match when={status() && app.activitiesReady()}>
        <Card>
          <EmptyState title="Missing activities" icon="activities">
            <p>This feature requires activities and none has been found.</p>
            <Show when={status()?.lastError}>
              <p class="act-error">Last sync failed: {status()!.lastError}</p>
            </Show>
            <Button variant="primary" icon="sync" disabled={status()?.running} onClick={() => app.sync("full")}>
              Sync your activities
            </Button>
          </EmptyState>
        </Card>
      </Match>
    </Switch>
  );
}
