// App-wide state: sync status (polled), the activity list, athlete and user settings.
import { createMemo, createResource, createRoot, createSignal, onCleanup } from "solid-js";
import { api } from "./api";
import { toast } from "./toast";
import type { Activity, Athlete, SyncMode, SyncStatus, UserSettings } from "./types";

function createAppState() {
  const [status, setStatus] = createSignal<SyncStatus | null>(null);
  const [fetchedRevision, setFetchedRevision] = createSignal<number | null>(null);

  // The activity list refetches whenever the server's revision moves (sync progress, edits,
  // recomputes). During a sync that's throttled to keep the page responsive.
  const [activityList, { refetch: refetchActivities, mutate: mutateActivities }] = createResource(
    fetchedRevision,
    () => api.activities(),
    { initialValue: [] as Activity[] }
  );

  const [athlete, { mutate: setAthlete }] = createResource(() => api.athlete());
  const [settings, { mutate: setSettings }] = createResource(() => api.settings());

  let lastRefresh = 0;
  let timer: number | undefined;
  let lastJob: string | undefined;
  let autoSynced = false;

  async function poll() {
    try {
      const s = await api.status();
      const prev = status();
      setStatus(s);
      if (!autoSynced) {
        // Like the original app, pull new workouts on every load: a cheap recent-window sync once a
        // full pass has completed, otherwise continue (or start) the full import.
        autoSynced = true;
        if (!s.running) {
          void api.sync(s.state === "SYNCED" ? "fast" : "full").then(() => pollSoon());
        }
      }
      if (prev?.running && !s.running) {
        if (s.lastError) toast(`${prev.job === "recompute" ? "Recalculation" : "Sync"} failed: ${s.lastError}`, "error");
        else if (lastJob === "sync" && prev.total > 0) toast(`Sync complete: ${prev.total} new workout(s)`);
        else if (lastJob === "recompute") toast("Activities recalculated with your new settings");
      }
      lastJob = s.job ?? lastJob;
      const now = Date.now();
      if (s.revision !== fetchedRevision() && (!s.running || now - lastRefresh > 4000)) {
        lastRefresh = now;
        setFetchedRevision(s.revision);
      }
    } catch {
      // Transient; try again on the next tick.
    }
    timer = window.setTimeout(poll, status()?.running ? 1500 : 15000);
  }

  function pollSoon() {
    window.clearTimeout(timer);
    timer = window.setTimeout(poll, 300);
  }

  async function sync(mode: SyncMode) {
    await api.sync(mode);
    pollSoon();
  }

  async function stopSync() {
    await api.stopSync();
    pollSoon();
  }

  async function saveAthlete(a: Athlete) {
    const saved = await api.saveAthlete(a);
    setAthlete(saved);
    pollSoon();
    return saved;
  }

  async function resetAthlete() {
    setAthlete(await api.resetAthlete());
    pollSoon();
  }

  async function saveSettings(u: UserSettings) {
    const saved = await api.saveSettings(u);
    setSettings(saved);
    pollSoon();
    return saved;
  }

  async function resetSettings() {
    setSettings(await api.resetSettings());
    pollSoon();
  }

  /** Activities, newest first. */
  const activities = createMemo(() => [...(activityList() ?? [])].reverse());

  /** Units of the user's measure system (defaults to metric while loading). */
  const measureSystem = () => settings()?.systemUnit ?? "metric";

  poll();
  onCleanup(() => window.clearTimeout(timer));

  return {
    status,
    activities,
    activitiesLoading: () => activityList.loading,
    activitiesReady: () => fetchedRevision() !== null && !activityList.loading,
    refetchActivities,
    mutateActivities,
    athlete,
    settings,
    measureSystem,
    sync,
    stopSync,
    saveAthlete,
    resetAthlete,
    saveSettings,
    resetSettings,
    pollSoon
  };
}

export const app = createRoot(createAppState);
