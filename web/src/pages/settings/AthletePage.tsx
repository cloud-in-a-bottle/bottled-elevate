// Athlete settings: personal details (gender and age feed the stats) plus dated physiological settings.
import { createMemo, For, Show } from "solid-js";
import { Card, Field, Icon, PageHeader, Select, Spinner } from "../../components/ui";
import { SPORTS, sportName } from "../../lib/format";
import { app } from "../../lib/state";
import { toast } from "../../lib/toast";
import type { Athlete, Gender } from "../../lib/types";
import { ageAt, today } from "./athlete-model";
import DatedSettingsCard from "./DatedSettingsCard";
import { errorMessage } from "./util";
import "./settings.css";

const MAX_SPORTS = 10;
const USUAL_SPORTS = ["Ride", "Run", "Swim", "Triathlon", "Hike", "Walk", "Rowing"];
const HIDDEN_SPORTS = ["Cardio", "Manual", "Mountaineering", "Orienteering", "Other", "VirtualRide", "VirtualRun", "Workout"];
const OTHER_SPORTS = SPORTS.filter(s => !USUAL_SPORTS.includes(s) && !HIDDEN_SPORTS.includes(s));

const PRACTICE_LEVELS = ["NOVICE", "ENTHUSIAST", "COMPETITIVE", "PRO"];
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function RecomputeNote() {
  return (
    <p class="recompute-note">
      <Icon name="info" size={16} />
      Saving these settings recalculates the stats of all your activities on the server; the top bar shows progress.
    </p>
  );
}

function AboutMeCard(props: { athlete: Athlete }) {
  async function update(patch: Partial<Athlete>) {
    try {
      await app.saveAthlete({ ...props.athlete, ...patch });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const age = createMemo(() => ageAt(props.athlete.birthDate));
  const sports = () => props.athlete.sports ?? [];

  function addSport(sport: string) {
    if (!sport) return;
    if (sports().length >= MAX_SPORTS) {
      toast(`You can't add more than ${MAX_SPORTS} preferred sports`, "error");
      return;
    }
    if (!sports().includes(sport)) update({ sports: [...sports(), sport] });
  }

  return (
    <Card title="About me">
      <div class="form-grid about-grid">
        <Field label="Gender">
          <Select<Gender>
            value={props.athlete.gender}
            options={[
              { value: "men", label: "Male" },
              { value: "women", label: "Female" }
            ]}
            onChange={v => update({ gender: v })}
          />
        </Field>
        <Field label="Birth date" hint={age() !== null ? `${age()} years old` : "Used for age-based scores"}>
          <input
            type="date"
            max={today()}
            value={props.athlete.birthDate ?? ""}
            onChange={e => update({ birthDate: e.currentTarget.value || null })}
          />
        </Field>
        <Field label="Practice level">
          <select class="input" value={props.athlete.practiceLevel ?? ""} onChange={e => update({ practiceLevel: e.currentTarget.value || null })}>
            <option value="">Not set</option>
            <For each={PRACTICE_LEVELS}>{l => <option value={l}>{titleCase(l)}</option>}</For>
          </select>
        </Field>
        <Field label="First name">
          <input type="text" value={props.athlete.firstName ?? ""} onChange={e => update({ firstName: e.currentTarget.value.trim() || null })} />
        </Field>
        <Field label="Last name">
          <input type="text" value={props.athlete.lastName ?? ""} onChange={e => update({ lastName: e.currentTarget.value.trim() || null })} />
        </Field>
      </div>
      <div class="field sports-field">
        <span class="field-label">Preferred sports (up to {MAX_SPORTS})</span>
        <div class="row-wrap">
          <For each={sports()}>
            {s => (
              <span class="chip">
                {sportName(s)}
                <button type="button" class="chip-remove" aria-label={`Remove ${sportName(s)}`} onClick={() => update({ sports: sports().filter(x => x !== s) })}>
                  <Icon name="close" size={14} />
                </button>
              </span>
            )}
          </For>
          <Show when={sports().length < MAX_SPORTS}>
            <select
              class="input sport-add"
              value=""
              onChange={e => {
                addSport(e.currentTarget.value);
                e.currentTarget.value = "";
              }}
            >
              <option value="">Add a sport…</option>
              <optgroup label="Usual sports">
                <For each={USUAL_SPORTS.filter(s => !sports().includes(s))}>{s => <option value={s}>{sportName(s)}</option>}</For>
              </optgroup>
              <optgroup label="Other sports">
                <For each={OTHER_SPORTS.filter(s => !sports().includes(s))}>{s => <option value={s}>{sportName(s)}</option>}</For>
              </optgroup>
            </select>
          </Show>
        </div>
      </div>
    </Card>
  );
}

export default function AthletePage() {
  return (
    <div class="settings-page">
      <PageHeader title="Athlete settings" />
      <RecomputeNote />
      <Show when={app.athlete()} fallback={<Spinner label="Loading athlete…" />}>
        {athlete => (
          <div class="stack">
            <AboutMeCard athlete={athlete()} />
            <DatedSettingsCard athlete={athlete()} />
          </div>
        )}
      </Show>
    </div>
  );
}
