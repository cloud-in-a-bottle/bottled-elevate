// A button that toggles a floating panel; closes on outside click or Escape.
import { createSignal, JSX, onCleanup, onMount, Show } from "solid-js";

export function Popover(props: {
  trigger: (open: boolean) => JSX.Element;
  children: JSX.Element;
  align?: "left" | "right";
  class?: string;
}) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  const onDocClick = (e: MouseEvent) => {
    if (open() && root && !root.contains(e.target as Node)) setOpen(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  };
  onMount(() => {
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", onDocClick);
    document.removeEventListener("keydown", onKey);
  });

  return (
    <div class="act-popover" ref={root}>
      <div onClick={() => setOpen(!open())}>{props.trigger(open())}</div>
      <Show when={open()}>
        <div class={`act-popover-panel ${props.align === "right" ? "right" : ""} ${props.class ?? ""}`}>{props.children}</div>
      </Show>
    </div>
  );
}
