// Multi-select sport filter (sports ordered by how often they're practiced).
import { For, Show } from "solid-js";
import { Button, Icon } from "../../components/ui";
import { sportName } from "../../lib/format";
import { Popover } from "./Popover";

export function SportFilter(props: {
  sports: { sport: string; count: number }[];
  selected: string[];
  onChange: (sports: string[]) => void;
}) {
  const label = () => {
    const n = props.selected.length;
    if (n === 0) return "All sports";
    if (n === 1) return sportName(props.selected[0]);
    return `${n} sports`;
  };
  const toggle = (sport: string, on: boolean) => {
    const set = new Set(props.selected);
    if (on) set.add(sport);
    else set.delete(sport);
    props.onChange(props.sports.map(s => s.sport).filter(s => set.has(s)));
  };

  return (
    <Popover
      class="act-sports-panel"
      trigger={() => (
        <button type="button" class="input act-select-trigger" classList={{ "act-filter-active": props.selected.length > 0 }}>
          <span>{label()}</span>
          <Icon name="expand" size={18} />
        </button>
      )}
    >
      <For each={props.sports}>
        {s => (
          <label class="act-check">
            <input type="checkbox" checked={props.selected.includes(s.sport)} onChange={e => toggle(s.sport, e.currentTarget.checked)} />
            <span>{sportName(s.sport)}</span>
            <span class="faint small act-count">{s.count}</span>
          </label>
        )}
      </For>
      <Show when={props.selected.length}>
        <div class="act-sports-clear">
          <Button small variant="ghost" icon="close" onClick={() => props.onChange([])}>
            Clear
          </Button>
        </div>
      </Show>
    </Popover>
  );
}
