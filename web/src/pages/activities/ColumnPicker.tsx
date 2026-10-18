// Column selection grouped by category, with tick-all / minimal / defaults shortcuts.
import { For } from "solid-js";
import { Button } from "../../components/ui";
import { ALL_COLUMNS, columnCategories, DEFAULT_COLUMN_IDS, MINIMAL_COLUMN_IDS } from "./columns";
import { Popover } from "./Popover";

export function ColumnPicker(props: { selected: string[]; onChange: (ids: string[]) => void }) {
  const categories = columnCategories();
  const isSelected = (id: string) => props.selected.includes(id);

  const toggle = (id: string, on: boolean) => {
    const set = new Set(props.selected);
    if (on) set.add(id);
    else if (set.size > 1) set.delete(id); // keep at least one column
    props.onChange(ALL_COLUMNS.filter(c => set.has(c.id)).map(c => c.id));
  };

  return (
    <Popover
      align="right"
      class="act-columns-panel"
      trigger={open => (
        <Button icon="zones" class={open ? "act-btn-open" : ""}>
          Columns ({props.selected.length})
        </Button>
      )}
    >
      <div class="act-columns-actions">
        <Button small onClick={() => props.onChange(ALL_COLUMNS.map(c => c.id))}>
          Tick all
        </Button>
        <Button small onClick={() => props.onChange([...MINIMAL_COLUMN_IDS])}>
          Un-tick all
        </Button>
        <Button small icon="refresh" onClick={() => props.onChange([...DEFAULT_COLUMN_IDS])}>
          Defaults
        </Button>
      </div>
      <div class="act-columns-groups">
        <For each={categories}>
          {cat => (
            <div class="act-columns-group">
              <div class="act-columns-group-title">{cat.label}</div>
              <For each={cat.columns}>
                {col => (
                  <label class="act-check" title={col.description ?? ""}>
                    <input
                      type="checkbox"
                      checked={isSelected(col.id)}
                      onChange={e => toggle(col.id, e.currentTarget.checked)}
                    />
                    <span>{col.header}</span>
                  </label>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </Popover>
  );
}
