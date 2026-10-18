// "Overview" (every progress type on the watched day) and the short help dialog.
import dayjs from "dayjs";
import { For } from "solid-js";
import { Dialog } from "../../components/ui";
import { sportName } from "../../lib/format";
import { ProgressMode, YearProgressModel, YearProgressTypeModel } from "./models";
import YearProgressTable from "./YearProgressTable";

export function OverviewDialog(props: {
  open: boolean;
  onClose: () => void;
  watched: Date;
  today: Date;
  mode: ProgressMode;
  rollingDays?: number;
  activityTypes: string[];
  progressTypes: YearProgressTypeModel[];
  yearProgressions: YearProgressModel[];
  selectedYears: number[];
  colors: Map<number, string>;
}) {
  return (
    <Dialog open={props.open} title={`Progressions on ${dayjs(props.watched).format("MMMM D")}`} onClose={props.onClose} wide>
      <div class="stack">
        <div class="muted small">
          {props.mode === ProgressMode.ROLLING ? `Rolling on ${props.rollingDays} days` : "Year to date"} ·{" "}
          {props.activityTypes.map(sportName).join(", ")}
        </div>
        <div class="yp-overview">
          <For each={props.progressTypes}>
            {type => (
              <div>
                <h3 class="yp-overview-title">{type.label}</h3>
                <YearProgressTable
                  yearProgressions={props.yearProgressions}
                  selectedYears={props.selectedYears}
                  progressType={type}
                  colors={props.colors}
                  targets={null}
                  watched={props.watched}
                  today={props.today}
                  mode={props.mode}
                  rollingDays={props.rollingDays}
                />
              </div>
            )}
          </For>
        </div>
      </div>
    </Dialog>
  );
}

export function HelpDialog(props: { open: boolean; onClose: () => void }) {
  const today = dayjs();
  const d = (n: number) => today.add(n, "day").format("MMMM D");
  return (
    <Dialog open={props.open} title="About year progressions" onClose={props.onClose}>
      <div class="stack yp-help">
        <section>
          <h3>Year to date</h3>
          <p>
            The total distance, time, elevation or activity count from January 1st up to a given day, compared with the same
            day of previous years. Today it answers: <i>“What have I done by {d(0)} this year compared to previous years?”</i>
          </p>
        </section>
        <section>
          <h3>Rolling</h3>
          <p>
            The total you maintained over a fixed window (e.g. the last 30 days) that slides every day. It tracks your training
            volume over time rather than per calendar year.
          </p>
          <p class="muted">
            Example: riding 20 km/day with a 30 day window gives 600 km today. Ride 40 km/day for the next 10 days and on {d(10)}{" "}
            it is 800 km (40×10 + 20×20). Stop riding after that and it drops by 20 km/day, then 40 km/day, reaching 0 on {d(40)}.
          </p>
        </section>
        <section>
          <h3>Using the chart</h3>
          <p>
            Hover the chart to compare every year on that day in the table; click to pin a day. Save the current selection as a
            preset, optionally with a target (a yearly total in year to date mode, or a volume to maintain in rolling mode) shown as a
            dashed line. Distances and elevations follow the units chosen in Global Settings.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
