# bottled-elevate

A fork of [Elevate](https://github.com/thomaschampagne/elevate) (fitness analytics) rebuilt as a single-user web app for [Cloud in a Bottle](https://github.com/imbue-openhost/openhost). It pulls workouts from the Cloud in a Bottle **health-data service**, which apps like `apple-health` and `oura` provide, instead of syncing from Strava or local files.

It has a Go backend and a SolidJS frontend. They replace the original Angular app and its Python proxy.

## Architecture

```
 health-data providers (apple-health, oura …)
        │  service mesh (fan-out to every running provider)
        ▼
 ┌─ elevate container ──────────────────────────────────────────┐
 │  backend/ (Go)                                               │
 │    • syncer: lists + fetches workouts, maps them to          │
 │      activities + streams (GPX route, HR/power/cadence)      │
 │    • compute: Elevate's ActivityComputer / StreamProcessor   │
 │      (stats, zones, peaks, stress scores, GAP, est. power)   │
 │    • sqlite: activities, raw streams, settings, UI prefs     │
 │    • re-derives every activity when athlete settings or      │
 │      zones change                                            │
 │    • serves /api/* and the static frontend                   │
 │                                                              │
 │  web/ (SolidJS + Vite)                                       │
 │    • activities, activity detail, compare, fitness trend,    │
 │      year progressions, athlete / zones / global settings    │
 │    • Plotly charts, Leaflet maps (no token needed)           │
 └──────────────────────────────────────────────────────────────┘
```

The health-data service is the source of truth. The sqlite store is a derived copy that a sync rebuilds. Auth is handled by the Cloud in a Bottle router (the compute-space owner), so the app is single-user.

## Layout

| Path | What |
|------|------|
| `backend/cmd/elevate` | the server binary |
| `backend/internal/compute` | stats engine: activity computer, stream processing, splits/peaks, laps, athlete snapshot resolution |
| `backend/internal/mapper` | health-data `Workout` → activity + raw streams, and the single `Derive` step that (re)computes stats |
| `backend/internal/syncer` | background sync (crash-safe, resumable, newest first) and recompute jobs |
| `backend/internal/health` | health-data service client (provider discovery + fan-out) |
| `backend/internal/store` | sqlite persistence; imports settings from the old Angular app's `records` table on first start |
| `backend/internal/api` | HTTP API + static file serving |
| `backend/cmd/devhealth`, `internal/devdata` | a mock router + provider with 18 months of synthetic workouts, for local dev and tests |
| `web/src/lib` | API client, wire types, app state, formatting |
| `web/src/components` | UI kit, Plotly and Leaflet wrappers |
| `web/src/pages/*` | one directory per page |
| `tests/` | OpenHost integration test (deploys the app next to a mock provider, drives it with Playwright) |

## API

| Method & path | What |
|---|---|
| `GET /api/status` | sync/recompute job state and progress, activity count, a revision that bumps on every change |
| `POST /api/sync` `{mode}` | `fast` (recent 7-day window), `full` (import everything missing), `force` (wipe and re-import) |
| `POST /api/sync/stop` | stop a running sync; the next one resumes where it stopped |
| `GET /api/activities` | every activity, without zones/peaks/laps |
| `GET /api/activities/{id}` | one activity with zones, peaks and auto-laps |
| `GET /api/activities/{id}/streams` | display-ready streams (smoothed; grade, GAP, estimated power) |
| `PATCH/DELETE /api/activities/{id}`, `POST …/recalculate` | edit name/type/notes, delete, recompute |
| `GET/PUT/DELETE /api/athlete`, `/api/settings` | athlete settings periods; units + zones (saving re-derives all activities) |
| `GET/PUT/DELETE /api/prefs/{key}` | small persisted UI documents (fitness trend config, year progress presets) |

## Develop

```bash
just setup          # npm ci for the frontend
just build-web      # build web/dist
just dev            # mock health service on :9090 + backend on :8080 serving web/dist
just dev-web        # optional: Vite hot reload on :5173 (proxies /api to :8080)
just test           # go test + tsc + vitest
```

Inside Cloud in a Bottle the backend needs `OPENHOST_ROUTER_URL`, `OPENHOST_APP_TOKEN` and `OPENHOST_SQLITE_MAIN`. `just dev` sets them up to point at the mock.

## Deploy on Cloud in a Bottle

```bash
oh app deploy <git-url> --name elevate --instance <instance>
oh app reload elevate --update --wait --instance <instance>   # after pushes
oh app logs elevate --instance <instance>
```

The manifest consumes `github.com/imbue-openhost/health-data-service-spec` (shortname `health`). At least one provider app, such as `apple-health`, must be installed for data to appear. Workout reads go to every running provider and are merged, because a plain service call only reaches the default provider.

When an existing install upgrades from the Angular version, its athlete settings, units/zones and year-progress presets carry over. Activities are rebuilt by the first sync, which the app starts on load.

## Notes

- **HR trace is per-minute** on Apple Health, so it is interpolated onto the finer GPS timeline. Without a route, the densest sensor trace forms the timeline.
- **Provider summaries win** over stream-derived values where both exist: distance, elevation gain, calories, duration, average speed/pace and average/max HR. Stress scores for workouts with no HR trace are estimated from average HR.
- **Laps are auto-laps** (1 km or 1 mi), because providers don't send lap markers.
- **Maps** use OpenStreetMap data with CARTO tiles, so no Mapbox token is needed.

## License

MPL-2.0 (inherited from upstream Elevate).
