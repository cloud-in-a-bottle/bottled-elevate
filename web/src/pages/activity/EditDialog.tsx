// Edit name, sport type and notes. Changing the type makes the server recompute the activity.
import { createEffect, createSignal, For } from "solid-js";
import { Button, Dialog, Field } from "../../components/ui";
import { api } from "../../lib/api";
import { sportName, SPORTS } from "../../lib/format";
import { toast } from "../../lib/toast";
import type { Activity } from "../../lib/types";

const USUAL_SPORTS = ["Ride", "Run", "Swim", "Hike", "Walk", "Rowing"];

export default function EditDialog(props: { open: boolean; activity: Activity; onClose: () => void; onSaved: (a: Activity) => void }) {
  const [name, setName] = createSignal("");
  const [type, setType] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (props.open) {
      setName(props.activity.name);
      setType(props.activity.type);
      setNotes(props.activity.notes ?? "");
    }
  });

  const save = async () => {
    const patch: Parameters<typeof api.updateActivity>[1] = {};
    if (name().trim() !== props.activity.name) patch.name = name().trim();
    if (type() !== props.activity.type) patch.type = type();
    if (notes() !== (props.activity.notes ?? "")) patch.notes = notes();
    if (!Object.keys(patch).length) return props.onClose();
    setSaving(true);
    try {
      props.onSaved(await api.updateActivity(props.activity.id, patch));
      toast(patch.type ? "Activity edited and recalculated." : "Activity edited.");
      props.onClose();
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const others = SPORTS.filter(s => !USUAL_SPORTS.includes(s));

  return (
    <Dialog
      open={props.open}
      title="Edit activity"
      onClose={props.onClose}
      actions={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name().trim() || saving()} onClick={save}>
            {saving() ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div class="stack edit-form">
        <Field label="Name">
          <input class="input" value={name()} onInput={e => setName(e.currentTarget.value)} required />
        </Field>
        <Field label="Sport type" hint={type() !== props.activity.type ? "Changing the sport type recalculates the activity's stats." : undefined}>
          <select class="input" value={type()} onChange={e => setType(e.currentTarget.value)}>
            <optgroup label="Usual sports">
              <For each={USUAL_SPORTS}>{s => <option value={s}>{sportName(s)}</option>}</For>
            </optgroup>
            <optgroup label="Other sports">
              <For each={others}>{s => <option value={s}>{sportName(s)}</option>}</For>
            </optgroup>
          </select>
        </Field>
        <Field label="Notes">
          <textarea class="input" rows={4} value={notes()} onInput={e => setNotes(e.currentTarget.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
