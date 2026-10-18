// Per-year values on the watched day, with deltas to the previous year, the current year and the target.
import dayjs from "dayjs";
import { createMemo, For, Show } from "solid-js";
import { DeltaType, ProgressMode, TargetProgressModel, YearProgressModel, YearProgressTypeModel } from "./models";
import { formatDelta, formatProgressValue } from "./format";
import { dayOfYear, findProgressionsAtDay, progressionRows } from "./yearProgress";

const deltaClass = (cls: string) =>
  cls === DeltaType.POSITIVE ? "yp-pos" : cls === DeltaType.NEGATIVE ? "yp-neg" : cls === DeltaType.NAN ? "faint" : "";

export default function YearProgressTable(props: {
  yearProgressions: YearProgressModel[];
  selectedYears: number[];
  progressType: YearProgressTypeModel;
  colors: Map<number, string>;
  targets: TargetProgressModel[] | null;
  watched: Date;
  today: Date;
  mode: ProgressMode;
  rollingDays?: number;
  hideYear?: boolean;
}) {
  const currentYear = () => props.today.getFullYear();

  const rows = createMemo(() => {
    const type = props.progressType.type;
    const years = [...props.selectedYears].sort((a, b) => b - a);
    const atDay = findProgressionsAtDay(props.yearProgressions, props.watched, type, years, props.colors);
    const current = findProgressionsAtDay(props.yearProgressions, props.watched, type, [currentYear()], props.colors)[0];
    const watchedDoy = dayOfYear(props.watched);
    const target = props.targets?.find(t => t.dayOfYear === watchedDoy) ?? null;
    const watchedIsFuture = dayOfYear(props.watched) > dayOfYear(props.today);
    return progressionRows(atDay, current, target, props.progressType, year => year === currentYear() && watchedIsFuture);
  });

  const asOf = () => `As of ${dayjs(props.watched).format("MMMM D")}`;
  const what = () => props.progressType.label.toLowerCase();
  const scope = () =>
    props.mode === ProgressMode.ROLLING
      ? `maintained during the last ${props.rollingDays} rolling days`
      : "accomplished since the beginning of the year";

  return (
    <div class="table-wrap">
      <table class="data yp-table">
        <thead>
          <tr>
            <Show when={!props.hideYear}>
              <th>Year</th>
            </Show>
            <th title={`${asOf()}, the total ${what()} ${scope()}.`}>{props.progressType.label}</th>
            <th title={`${asOf()}, the ${what()} delta ${scope()}, compared to the previous selected year.`}>Δ Prev. year</th>
            <th title={`${asOf()}, the ${what()} delta ${scope()}, compared to ${currentYear()}.`}>Δ {currentYear()}</th>
            <Show when={props.targets}>
              <th title={`${asOf()}, the ${what()} delta ${scope()}, compared to the target.`}>Δ Target</th>
            </Show>
          </tr>
        </thead>
        <tbody>
          <For each={rows()}>
            {row => (
              <tr>
                <Show when={!props.hideYear}>
                  <td>
                    <strong style={{ color: row.color ?? undefined }}>{row.year}</strong>
                  </td>
                </Show>
                <td>{formatProgressValue(row.currentValue, props.progressType)}</td>
                <td
                  class={deltaClass(row.deltaPreviousYear.class)}
                  title={row.deltaPreviousYear.date ? `Compared to ${row.deltaPreviousYear.date}` : ""}
                >
                  {formatDelta(row.deltaPreviousYear, props.progressType)}
                </td>
                <td
                  class={deltaClass(row.deltaCurrentYear.class)}
                  title={row.deltaCurrentYear.date ? `Compared to ${row.deltaCurrentYear.date}` : ""}
                >
                  {formatDelta(row.deltaCurrentYear, props.progressType)}
                </td>
                <Show when={props.targets}>
                  <td class={deltaClass(row.deltaTarget?.class ?? "")} title="Compared to the target">
                    {row.deltaTarget?.class === DeltaType.NAN ? "∅" : formatDelta(row.deltaTarget, props.progressType)}
                  </td>
                </Show>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
