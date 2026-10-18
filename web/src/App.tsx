import { A, useLocation } from "@solidjs/router";
import { createSignal, For, JSX, Show } from "solid-js";
import { Button, ConfirmHost, Icon, IconButton, type IconName } from "./components/ui";
import { app } from "./lib/state";
import { theme, toggleTheme } from "./lib/theme";
import { dismissToast, toasts } from "./lib/toast";
import { loadLocal, saveLocal } from "./lib/storage";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/activities", label: "Activities", icon: "activities" },
  { href: "/fitness-trend", label: "Fitness Trend", icon: "trend" },
  { href: "/year-progress", label: "Year Progressions", icon: "calendar" },
  { href: "/athlete", label: "Athlete Settings", icon: "athlete" },
  { href: "/zones", label: "Zones Settings", icon: "zones" },
  { href: "/settings", label: "Global Settings", icon: "settings" }
];

function pageTitle(path: string): string {
  if (path.startsWith("/activity/compare")) return "Compare Activities";
  if (path.startsWith("/activity/")) return "Activity";
  return NAV.find(n => path.startsWith(n.href))?.label ?? "Elevate";
}

function SyncControl() {
  const status = app.status;
  const [menuOpen, setMenuOpen] = createSignal(false);
  const progress = () => {
    const s = status();
    return s && s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
  };
  const label = () => {
    const s = status();
    if (!s) return "";
    if (s.running && s.job === "recompute") return `Recalculating ${s.done}/${s.total}`;
    if (s.running) return s.total ? `Syncing ${s.done}/${s.total}` : "Listing workouts…";
    if (s.state === "NOT_SYNCED") return "Not synced";
    if (s.state === "PARTIALLY_SYNCED") return "Partially synced";
    return s.lastSyncTime ? `Synced ${new Date(s.lastSyncTime).toLocaleString()}` : "Synced";
  };

  return (
    <div class="sync-control">
      <Show when={status()?.running}>
        <div class="sync-progress" title={`${progress()}%`}>
          <div style={{ width: `${progress()}%` }} />
        </div>
      </Show>
      <span class="sync-label muted small">{label()}</span>
      <Show
        when={status()?.running && status()?.job === "sync"}
        fallback={
          <div style={{ position: "relative" }} class="row">
            <Button
              variant="primary"
              icon="sync"
              disabled={status()?.running}
              onClick={() => app.sync(status()?.state === "SYNCED" ? "fast" : "full")}
            >
              {status()?.state === "PARTIALLY_SYNCED" ? "Continue sync" : "Sync"}
            </Button>
            <IconButton icon="expand" label="More sync options" onClick={() => setMenuOpen(!menuOpen())} />
            <Show when={menuOpen()}>
              <div class="menu" onMouseLeave={() => setMenuOpen(false)}>
                <button onClick={() => (setMenuOpen(false), app.sync("full"))}>Sync all workouts</button>
                <button onClick={() => (setMenuOpen(false), app.sync("force"))}>Clear and re-sync everything</button>
              </div>
            </Show>
          </div>
        }
      >
        <Button icon="stop" onClick={() => app.stopSync()}>
          Stop
        </Button>
      </Show>
    </div>
  );
}

export default function App(props: { children?: JSX.Element }) {
  const location = useLocation();
  const isNarrow = () => window.matchMedia("(max-width: 800px)").matches;
  // On a phone the nav is an overlay, so start closed there.
  const [navOpen, setNavOpen] = createSignal(!isNarrow() && loadLocal("navOpen", true));
  const toggleNav = () => {
    setNavOpen(!navOpen());
    if (!isNarrow()) saveLocal("navOpen", navOpen());
  };

  return (
    <div class="shell" classList={{ "nav-collapsed": !navOpen(), "nav-open": navOpen() }}>
      <aside class="sidebar">
        <div class="sidebar-brand">
          <svg class="brand-logo" viewBox="0 0 64 44" aria-hidden="true">
            <path d="M2 42 L20 12 L38 42 Z M18 42 L32 2 L46 42 M28 42 L44 16 L62 42 Z" />
          </svg>
          Elevate
        </div>
        <nav class="nav">
          <For each={NAV}>
            {n => (
              <A href={n.href} activeClass="active" onClick={() => isNarrow() && setNavOpen(false)}>
                <Icon name={n.icon} />
                {n.label}
              </A>
            )}
          </For>
        </nav>
      </aside>
      <div class="main">
        <header class="topbar">
          <IconButton icon="menu" label="Toggle navigation" onClick={toggleNav} />
          <div class="topbar-title">{pageTitle(location.pathname)}</div>
          <div class="spacer" />
          <SyncControl />
          <IconButton icon={theme() === "dark" ? "sun" : "moon"} label="Toggle theme" onClick={toggleTheme} />
        </header>
        <main class="content">
          <div class="content-inner">{props.children}</div>
        </main>
      </div>
      <div class="toasts">
        <For each={toasts()}>
          {t => (
            <div class="toast" classList={{ error: t.kind === "error" }}>
              <span>{t.message}</span>
              <IconButton icon="close" label="Dismiss" onClick={() => dismissToast(t.id)} />
            </div>
          )}
        </For>
      </div>
      <ConfirmHost />
    </div>
  );
}
