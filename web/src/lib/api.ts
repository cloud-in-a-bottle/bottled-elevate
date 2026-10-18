import type { Activity, Athlete, Streams, SyncMode, SyncStatus, UserSettings } from "./types";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// Relative URLs so the app works under any mount path.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`api/${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json()).error || message;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

const id = (activityId: string) => encodeURIComponent(activityId);

export const api = {
  status: () => request<SyncStatus>("GET", "status"),
  sync: (mode: SyncMode) => request<{ started: boolean }>("POST", "sync", { mode }),
  stopSync: () => request<{ ok: boolean }>("POST", "sync/stop"),

  /** Every activity, oldest first, without zones/peaks/laps. */
  activities: () => request<Activity[]>("GET", "activities"),
  /** One activity with zones, peaks and laps. */
  activity: (activityId: string) => request<Activity>("GET", `activities/${id(activityId)}`),
  /** Display-ready streams (smoothed; grade, GAP and estimated power derived), or null. */
  streams: (activityId: string) => request<Streams | null>("GET", `activities/${id(activityId)}/streams`),
  updateActivity: (
    activityId: string,
    patch: Partial<Pick<Activity, "name" | "type" | "notes" | "trainer" | "commute">>
  ) => request<Activity>("PATCH", `activities/${id(activityId)}`, patch),
  deleteActivity: (activityId: string) => request<{ ok: boolean }>("DELETE", `activities/${id(activityId)}`),
  recalculateActivity: (activityId: string) => request<Activity>("POST", `activities/${id(activityId)}/recalculate`),
  recalculateAll: () => request<{ started: boolean }>("POST", "activities/recalculate"),

  athlete: () => request<Athlete>("GET", "athlete"),
  /** Saving athlete settings re-derives every activity's stats server-side. */
  saveAthlete: (athlete: Athlete) => request<Athlete>("PUT", "athlete", athlete),
  resetAthlete: () => request<Athlete>("DELETE", "athlete"),
  settings: () => request<UserSettings>("GET", "settings"),
  /** Saving changed zones re-derives every activity's stats server-side. */
  saveSettings: (settings: UserSettings) => request<UserSettings>("PUT", "settings", settings),
  resetSettings: () => request<UserSettings>("DELETE", "settings"),

  /** Small persisted UI documents (fitness trend config, year progress presets, ...). */
  pref: <T>(key: string) => request<T | null>("GET", `prefs/${encodeURIComponent(key)}`),
  savePref: (key: string, value: unknown) => request<{ ok: boolean }>("PUT", `prefs/${encodeURIComponent(key)}`, value),
  deletePref: (key: string) => request<{ ok: boolean }>("DELETE", `prefs/${encodeURIComponent(key)}`)
};
