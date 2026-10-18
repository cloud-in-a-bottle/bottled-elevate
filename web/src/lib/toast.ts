import { createRoot, createSignal } from "solid-js";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
}

const store = createRoot(() => {
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  return { toasts, setToasts };
});

let nextId = 1;

export const toasts = store.toasts;

/** Show a transient notification at the bottom of the screen. */
export function toast(message: string, kind: Toast["kind"] = "info", durationMs = 5000): void {
  const t = { id: nextId++, message, kind };
  store.setToasts(list => [...list, t]);
  window.setTimeout(() => dismissToast(t.id), durationMs);
}

export function dismissToast(id: number): void {
  store.setToasts(list => list.filter(t => t.id !== id));
}
