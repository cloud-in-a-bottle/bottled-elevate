// Small UI kit: buttons, cards, dialogs, tabs, switches and form fields. Styles live in styles.css.
import { createSignal, For, JSX, Show, splitProps } from "solid-js";
import { Portal } from "solid-js/web";

// Material Design icon paths (24x24).
const ICONS = {
  activities: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  trend: "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z",
  calendar: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  athlete: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  zones: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
  sync: "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z",
  stop: "M6 6h12v12H6z",
  menu: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
  sun: "M12 7a5 5 0 100 10 5 5 0 000-10zM2 13h2a1 1 0 000-2H2a1 1 0 000 2zm18 0h2a1 1 0 000-2h-2a1 1 0 000 2zM11 2v2a1 1 0 002 0V2a1 1 0 00-2 0zm0 18v2a1 1 0 002 0v-2a1 1 0 00-2 0zM5.99 4.58a1 1 0 00-1.41 1.41l1.06 1.06a1 1 0 001.41-1.41L5.99 4.58zm12.37 12.37a1 1 0 00-1.41 1.41l1.06 1.06a1 1 0 001.41-1.41l-1.06-1.06zm1.06-10.96a1 1 0 00-1.41-1.41l-1.06 1.06a1 1 0 001.41 1.41l1.06-1.06zM7.05 18.36a1 1 0 00-1.41-1.41l-1.06 1.06a1 1 0 001.41 1.41l1.06-1.06z",
  moon: "M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z",
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  refresh: "M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  remove: "M19 13H5v-2h14v2z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  upload: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
  info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  warning: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  compare: "M10 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h5v2h2V1h-2v2zm0 15H5l5-6v6zm9-15h-5v2h5v13l-5-6v9h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z",
  chevronLeft: "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z",
  chevronRight: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  expand: "M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  map: "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z",
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  bolt: "M7 2v11h3v9l7-12h-4l4-8z",
  swim: "M22 21c-1.11 0-1.73-.37-2.18-.64-.37-.22-.6-.36-1.15-.36-.56 0-.78.13-1.15.36-.46.27-1.07.64-2.18.64s-1.73-.37-2.18-.64c-.37-.22-.6-.36-1.15-.36-.56 0-.78.13-1.15.36-.46.27-1.08.64-2.19.64-1.11 0-1.73-.37-2.18-.64-.37-.23-.6-.36-1.15-.36s-.78.13-1.15.36c-.46.27-1.08.64-2.19.64v-2c.56 0 .78-.13 1.15-.36.46-.27 1.08-.64 2.19-.64s1.73.37 2.18.64c.37.23.59.36 1.15.36.56 0 .78-.13 1.15-.36.46-.27 1.08-.64 2.19-.64 1.11 0 1.73.37 2.18.64.37.22.6.36 1.15.36s.78-.13 1.15-.36c.45-.27 1.07-.64 2.18-.64s1.73.37 2.18.64c.37.23.59.36 1.15.36v2zM8.67 12c.56 0 .78-.13 1.15-.36.46-.27 1.08-.64 2.19-.64 1.11 0 1.73.37 2.18.64.37.22.6.36 1.15.36s.78-.13 1.15-.36c.12-.07.26-.15.41-.23L10.48 5C8.93 3.45 7.5 2.99 5 3v2.5c1.82-.01 2.89.39 4 1.5l1 1-3.25 3.25c.31.12.56.27.77.39.37.23.59.36 1.15.36z"
} as const;

export type IconName = keyof typeof ICONS;

export function Icon(props: { name: IconName; size?: number; class?: string }) {
  return (
    <svg class={`icon ${props.class ?? ""}`} width={props.size ?? 20} height={props.size ?? 20} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[props.name]} fill="currentColor" />
    </svg>
  );
}

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  small?: boolean;
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["variant", "icon", "children", "class", "small"]);
  return (
    <button
      type="button"
      class={`btn btn-${local.variant ?? "secondary"} ${local.small ? "btn-small" : ""} ${local.class ?? ""}`}
      {...rest}
    >
      <Show when={local.icon}>
        <Icon name={local.icon!} size={local.small ? 16 : 18} />
      </Show>
      {local.children}
    </button>
  );
}

export function IconButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  const [local, rest] = splitProps(props, ["icon", "label", "class"]);
  return (
    <button type="button" class={`icon-btn ${local.class ?? ""}`} title={local.label} aria-label={local.label} {...rest}>
      <Icon name={local.icon} />
    </button>
  );
}

export function Card(props: { title?: JSX.Element; actions?: JSX.Element; children: JSX.Element; class?: string }) {
  return (
    <section class={`card ${props.class ?? ""}`}>
      <Show when={props.title || props.actions}>
        <header class="card-header">
          <h2 class="card-title">{props.title}</h2>
          <div class="card-actions">{props.actions}</div>
        </header>
      </Show>
      {props.children}
    </section>
  );
}

export function Spinner(props: { label?: string }) {
  return (
    <div class="spinner-wrap" role="status">
      <div class="spinner" />
      <Show when={props.label}>
        <span class="muted">{props.label}</span>
      </Show>
    </div>
  );
}

export function EmptyState(props: { title: string; children?: JSX.Element; icon?: IconName }) {
  return (
    <div class="empty-state">
      <Icon name={props.icon ?? "info"} size={40} />
      <h3>{props.title}</h3>
      <div class="muted">{props.children}</div>
    </div>
  );
}

export function Dialog(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: JSX.Element;
  actions?: JSX.Element;
  wide?: boolean;
}) {
  return (
    <Show when={props.open}>
      <Portal>
        <div class="dialog-backdrop" onClick={e => e.target === e.currentTarget && props.onClose()}>
          <div class={`dialog ${props.wide ? "dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={props.title}>
            <header class="dialog-header">
              <h2>{props.title}</h2>
              <IconButton icon="close" label="Close" onClick={() => props.onClose()} />
            </header>
            <div class="dialog-body">{props.children}</div>
            <Show when={props.actions}>
              <footer class="dialog-actions">{props.actions}</footer>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

// Promise-based confirm dialog: `if (await confirm({...})) ...`
const [confirmState, setConfirmState] = createSignal<{
  title: string;
  message: JSX.Element;
  confirmText: string;
  danger: boolean;
  resolve: (v: boolean) => void;
} | null>(null);

export function confirm(opts: { title: string; message: JSX.Element; confirmText?: string; danger?: boolean }): Promise<boolean> {
  return new Promise(resolve =>
    setConfirmState({ title: opts.title, message: opts.message, confirmText: opts.confirmText ?? "Confirm", danger: !!opts.danger, resolve })
  );
}

export function ConfirmHost() {
  const close = (v: boolean) => {
    confirmState()?.resolve(v);
    setConfirmState(null);
  };
  return (
    <Dialog
      open={!!confirmState()}
      title={confirmState()?.title ?? ""}
      onClose={() => close(false)}
      actions={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={confirmState()?.danger ? "danger" : "primary"} onClick={() => close(true)}>
            {confirmState()?.confirmText}
          </Button>
        </>
      }
    >
      <div>{confirmState()?.message}</div>
    </Dialog>
  );
}

export function Tabs<T extends string>(props: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div class="tabs" role="tablist">
      <For each={props.tabs}>
        {t => (
          <button
            type="button"
            role="tab"
            class="tab"
            classList={{ active: t.id === props.active }}
            aria-selected={t.id === props.active}
            onClick={() => props.onChange(t.id)}
          >
            {t.label}
          </button>
        )}
      </For>
    </div>
  );
}

/** A segmented toggle (one of N). */
export function Segmented<T extends string | number>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  class?: string;
}) {
  return (
    <div class={`segmented ${props.class ?? ""}`} role="radiogroup">
      <For each={props.options}>
        {o => (
          <button
            type="button"
            role="radio"
            aria-checked={o.value === props.value}
            classList={{ active: o.value === props.value }}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label?: JSX.Element; title?: string; disabled?: boolean }) {
  return (
    <label class="switch" title={props.title} classList={{ disabled: props.disabled }}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={e => props.onChange(e.currentTarget.checked)} />
      <span class="switch-track">
        <span class="switch-thumb" />
      </span>
      <Show when={props.label}>
        <span>{props.label}</span>
      </Show>
    </label>
  );
}

export function Field(props: { label: JSX.Element; hint?: JSX.Element; children: JSX.Element; class?: string }) {
  return (
    <label class={`field ${props.class ?? ""}`}>
      <span class="field-label">{props.label}</span>
      {props.children}
      <Show when={props.hint}>
        <span class="field-hint">{props.hint}</span>
      </Show>
    </label>
  );
}

export function Select<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  class?: string;
}) {
  return (
    <select class={`input ${props.class ?? ""}`} value={props.value} onChange={e => props.onChange(e.currentTarget.value as T)}>
      <For each={props.options}>{o => <option value={o.value}>{o.label}</option>}</For>
    </select>
  );
}

export function PageHeader(props: { title: JSX.Element; children?: JSX.Element }) {
  return (
    <div class="page-header">
      <h1>{props.title}</h1>
      <div class="page-header-actions">{props.children}</div>
    </div>
  );
}
