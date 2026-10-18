import { isRide, isRun, isSwim } from "../../../lib/format";
import type { Activity, MeasureSystem } from "../../../lib/types";
import { PaceSensor, SwimmingPaceSensor } from "./sensors";

/** One-line summary of the athlete settings an activity was computed with (formatAthleteSnapshot). */
export function formatAthleteSnapshot(a: Activity, ms: MeasureSystem): string {
  const ride = isRide(a.type);
  const run = isRun(a.type);
  const swim = isSwim(a.type);
  const snap = a.athleteSnapshot;
  const st = snap.athleteSettings;

  let out = `Weight ${st.weight}kg`;
  if (snap.age) out += ` - Age ${snap.age}`;
  out += ` - MaxHR ${st.maxHr}bpm`;
  out += ` - RestHR ${st.restHr}bpm`;

  if (st.lthr.cycling && ride) out += ` - Lthr ${st.lthr.cycling}bpm`;
  else if (st.lthr.running && run) out += ` - Lthr ${st.lthr.running}bpm`;
  else if (st.lthr.default) out += ` - Lthr ${st.lthr.default}bpm`;

  if (ride) out += ` - Threshold ${st.cyclingFtp ? st.cyclingFtp + "w" : "Missing"}`;
  if (run) {
    const p = PaceSensor.DEFAULT;
    out += ` - Threshold ${st.runningFtp ? p.formatFromStat(st.runningFtp, ms) + p.displayUnit(ms) : "Missing"}`;
  }
  if (swim) {
    const p = SwimmingPaceSensor.DEFAULT;
    // swimFtp is m/min: convert to s/km
    out += ` - Threshold ${st.swimFtp ? p.formatFromStat((1 / (st.swimFtp / 60)) * 1000, ms) + p.displayUnit(ms) : "Missing"}`;
  }
  return out;
}
