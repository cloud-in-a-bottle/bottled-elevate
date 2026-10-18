// Sensor definitions (port of activity-view/shared/models/sensors/* and ActivitySensorsService).
// A sensor knows how to read, convert and format one kind of measure (stream, stat, peaks, zones).
import {
  KM_TO_MILE_FACTOR,
  METER_TO_FEET_FACTOR,
  METER_TO_YARD_FACTOR,
  MPS_KPH_FACTOR,
  round,
  secToMilitary,
  speedToPace
} from "../../../lib/format";
import type { Activity, MeasureSystem, Streams } from "../../../lib/types";

export interface DisplayUnit {
  short: string;
  full: string;
}

type UnitDef = DisplayUnit | { metric: DisplayUnit; imperial: DisplayUnit } | null;

const isImperial = (ms: MeasureSystem) => ms === "imperial";

/** A measure that can be formatted as a stat (time, distance, ...). */
export class BaseSensor {
  name = "Void";
  defaultRoundDecimals = 0;
  unitDef: UnitDef = null;
  isEstimated = false;

  displayUnit(ms: MeasureSystem, short = true): string | null {
    const u = this.unitDef;
    if (!u) return null;
    const d = "metric" in u ? u[ms] : u;
    return short ? d.short : d.full;
  }

  formatFromStat(value: number, _ms: MeasureSystem, decimals: number = this.defaultRoundDecimals): number | string {
    return round(value, decimals);
  }
}

/** Kind of zones a sensor maps to (served under stats.<path>). */
export type ZonesPath =
  | "heartRate.zones"
  | "speed.zones"
  | "pace.zones"
  | "power.zones"
  | "cadence.zones"
  | "grade.zones"
  | "elevation.elevationZones";

/** A plottable sensor backed by a stream. */
export class Sensor extends BaseSensor {
  /** CSS custom property holding the sensor color (theme aware). */
  colorVar = "--c-speed";
  streamKey: keyof Streams = "velocity_smooth";
  /** Path of peaks under activity.stats, if any. */
  peaksPath: string | null = null;
  zonesPath: ZonesPath | null = null;
  /** Values are durations (pace): plot on a reversed time axis. */
  isPace = false;

  fromStreamConvert(v: number, _ms: MeasureSystem): number | null {
    return v;
  }

  fromZoneBoundConvert(v: number, _ms: MeasureSystem): number {
    return v;
  }

  displayZoneBoundValue(v: number): string | number {
    return v;
  }
}

// ---- Base (non plottable) sensors ----

export class TimeSensor extends BaseSensor {
  static readonly DEFAULT = new TimeSensor();
  name = "Time";
  formatFromStat(v: number): string {
    return secToMilitary(v, true);
  }
}

export class VoidSensor extends BaseSensor {
  static readonly DEFAULT = new VoidSensor();
}

export class DistanceSensor extends BaseSensor {
  static readonly DEFAULT = new DistanceSensor();
  name = "Distance";
  defaultRoundDecimals = 1;
  unitDef: UnitDef = { metric: { short: "km", full: "Kilometers" }, imperial: { short: "mi", full: "Miles" } };
  formatFromStat(meters: number, ms: MeasureSystem, decimals = this.defaultRoundDecimals): number {
    const d = (meters / 1000) * (isImperial(ms) ? KM_TO_MILE_FACTOR : 1);
    return Number.isFinite(decimals) ? round(d, decimals) : d;
  }
}

export class RunningDistanceSensor extends DistanceSensor {
  static readonly DEFAULT = new RunningDistanceSensor();
  defaultRoundDecimals = 2;
}

export class SwimDistanceSensor extends DistanceSensor {
  static readonly DEFAULT = new SwimDistanceSensor();
  defaultRoundDecimals = 2;
  unitDef: UnitDef = { metric: { short: "m", full: "Meters" }, imperial: { short: "yd", full: "Yards" } };
  formatFromStat(meters: number, ms: MeasureSystem, decimals = this.defaultRoundDecimals): number {
    const d = meters * (isImperial(ms) ? METER_TO_YARD_FACTOR : 1);
    return Number.isFinite(decimals) ? round(d, decimals) : d;
  }
}

// ---- Stream sensors ----

export class ElevationSensor extends Sensor {
  static readonly DEFAULT = new ElevationSensor();
  name = "Elevation";
  colorVar = "--c-elevation";
  streamKey: keyof Streams = "altitude";
  unitDef: UnitDef = { metric: { short: "m", full: "Meters" }, imperial: { short: "ft", full: "Feet" } };
  peaksPath = "elevation.peaks";
  zonesPath: ZonesPath = "elevation.elevationZones";
  fromStreamConvert(m: number, ms: MeasureSystem) {
    return m * (isImperial(ms) ? METER_TO_FEET_FACTOR : 1);
  }
  fromZoneBoundConvert(v: number, ms: MeasureSystem) {
    return isImperial(ms) ? Math.round(v * METER_TO_FEET_FACTOR) : v;
  }
  formatFromStat(m: number, ms: MeasureSystem, decimals = this.defaultRoundDecimals) {
    const c = m * (isImperial(ms) ? METER_TO_FEET_FACTOR : 1);
    return Number.isFinite(decimals) ? round(c, decimals) : c;
  }
}

export class ElevationAscentSpeedSensor extends ElevationSensor {
  static readonly DEFAULT = new ElevationAscentSpeedSensor();
  name = "Ascent Speed";
  unitDef: UnitDef = {
    metric: { short: "vm/h", full: "Vertical meters / hour" },
    imperial: { short: "vf/h", full: "Vertical feet / hour" }
  };
}

export class SpeedSensor extends Sensor {
  static readonly DEFAULT = new SpeedSensor();
  name = "Speed";
  defaultRoundDecimals = 1;
  peaksPath = "speed.peaks";
  zonesPath: ZonesPath = "speed.zones";
  unitDef: UnitDef = { metric: { short: "kph", full: "Kilometers / hour" }, imperial: { short: "mph", full: "Miles / hour" } };
  fromStreamConvert(mps: number, ms: MeasureSystem) {
    return mps * MPS_KPH_FACTOR * (isImperial(ms) ? KM_TO_MILE_FACTOR : 1);
  }
  fromZoneBoundConvert(v: number, ms: MeasureSystem) {
    return isImperial(ms) ? round(v * KM_TO_MILE_FACTOR, 1) : v;
  }
  formatFromStat(kph: number, ms: MeasureSystem, decimals = this.defaultRoundDecimals) {
    const s = kph * (isImperial(ms) ? KM_TO_MILE_FACTOR : 1);
    return Number.isFinite(decimals) ? round(s, decimals) : s;
  }
}

/** Paces slower than this (s/km) are treated as stopped (keeps charts readable). */
const MAX_PLOTTED_PACE = 3600;

export class PaceSensor extends Sensor {
  static readonly DEFAULT = new PaceSensor();
  name = "Pace";
  defaultRoundDecimals = 1;
  isPace = true;
  peaksPath: string | null = "speed.peaks";
  zonesPath: ZonesPath | null = "pace.zones";
  unitDef: UnitDef = { metric: { short: "/km", full: "Time / kilometer" }, imperial: { short: "/mi", full: "Time / mile" } };
  fromStreamConvert(mps: number, ms: MeasureSystem) {
    const pace = speedToPace(mps * MPS_KPH_FACTOR);
    if (pace === null || pace > MAX_PLOTTED_PACE) return null;
    return isImperial(ms) ? pace / KM_TO_MILE_FACTOR : pace;
  }
  fromZoneBoundConvert(v: number, ms: MeasureSystem) {
    return isImperial(ms) ? round(v / KM_TO_MILE_FACTOR, 1) : v;
  }
  displayZoneBoundValue(v: number) {
    return secToMilitary(v, true);
  }
  formatFromStat(secPerKm: number, ms: MeasureSystem): string {
    return secToMilitary(isImperial(ms) ? round(secPerKm / KM_TO_MILE_FACTOR, 1) : secPerKm, true);
  }
}

export class GradeAdjustedPaceSensor extends PaceSensor {
  static readonly DEFAULT = new GradeAdjustedPaceSensor();
  name = "Grade Adj. Pace";
  colorVar = "--c-fitness";
  streamKey: keyof Streams = "grade_adjusted_speed";
  peaksPath = null;
  zonesPath = null;
}

export class SwimmingPaceSensor extends PaceSensor {
  static readonly DEFAULT = new SwimmingPaceSensor();
  unitDef: UnitDef = {
    metric: { short: "/100m", full: "Time / hundred meters" },
    imperial: { short: "/100yd", full: "Time / hundred yards" }
  };
  // s/100m -> s/100yd: 100yd is shorter than 100m.
  private per100(secPer100m: number, ms: MeasureSystem) {
    return isImperial(ms) ? secPer100m / METER_TO_YARD_FACTOR : secPer100m;
  }
  fromStreamConvert(mps: number, ms: MeasureSystem) {
    if (!(mps > 0)) return null;
    const secPer100m = 100 / mps;
    return secPer100m > MAX_PLOTTED_PACE / 10 ? null : this.per100(secPer100m, ms);
  }
  // Pace zones are stored in s/km.
  fromZoneBoundConvert(v: number, ms: MeasureSystem) {
    return round(this.per100(v / 10, ms), 1);
  }
  formatFromStat(secPerKm: number, ms: MeasureSystem): string {
    return secToMilitary(this.per100(secPerKm / 10, ms), true);
  }
}

export class HeartRateSensor extends Sensor {
  static readonly DEFAULT = new HeartRateSensor();
  name = "Heart Rate";
  colorVar = "--c-hr";
  streamKey: keyof Streams = "heartrate";
  unitDef: UnitDef = { short: "bpm", full: "Beats / minute" };
  peaksPath = "heartRate.peaks";
  zonesPath: ZonesPath = "heartRate.zones";
}

export class PowerSensor extends Sensor {
  name = "Power";
  colorVar = "--c-power";
  streamKey: keyof Streams = "watts";
  unitDef: UnitDef = { short: "w", full: "Watts" };
  peaksPath = "power.peaks";
  zonesPath: ZonesPath = "power.zones";
  constructor(hasPowerMeter: boolean) {
    super();
    this.isEstimated = !hasPowerMeter;
    if (this.isEstimated) this.name = `Est. ${this.name}`;
  }
  static readonly REAL = new PowerSensor(true);
  static readonly ESTIMATED = new PowerSensor(false);
  static forActivity(a: Pick<Activity, "hasPowerMeter">): PowerSensor {
    return a.hasPowerMeter ? PowerSensor.REAL : PowerSensor.ESTIMATED;
  }
}

export class CadenceSensor extends Sensor {
  name = "Cadence";
  colorVar = "--c-cadence";
  streamKey: keyof Streams = "cadence";
  peaksPath = "cadence.peaks";
  zonesPath: ZonesPath | null = "cadence.zones";
}

export class CyclingCadenceSensor extends CadenceSensor {
  static readonly DEFAULT = new CyclingCadenceSensor();
  unitDef: UnitDef = { short: "rpm", full: "Revolutions / minute" };
}

export class RunningCadenceSensor extends CadenceSensor {
  static readonly DEFAULT = new RunningCadenceSensor();
  unitDef: UnitDef = { short: "spm", full: "Strides / minute (2 legs)" };
  fromZoneBoundConvert(v: number) {
    return v * 2;
  }
  fromStreamConvert(v: number) {
    return v * 2;
  }
  formatFromStat(v: number, _ms: MeasureSystem, decimals = this.defaultRoundDecimals) {
    return Number.isFinite(decimals) ? round(v * 2, decimals) : v * 2;
  }
}

export class SwimmingCadenceSensor extends CadenceSensor {
  static readonly DEFAULT = new SwimmingCadenceSensor();
  zonesPath = null;
  unitDef: UnitDef = { short: "spm", full: "Strokes / minute" };
}

export class GradeSensor extends Sensor {
  static readonly DEFAULT = new GradeSensor();
  name = "Grade";
  colorVar = "--c-grade";
  streamKey: keyof Streams = "grade_smooth";
  defaultRoundDecimals = 1;
  unitDef: UnitDef = { short: "%", full: "Percentage" };
  peaksPath = "grade.peaks";
  zonesPath: ZonesPath = "grade.zones";
}

// ---- Per-sport sensor sets (ActivitySensorsService) ----

type SportLike = Pick<Activity, "type" | "hasPowerMeter">;

function cyclingSensors(a: SportLike): Sensor[] {
  return [ElevationSensor.DEFAULT, SpeedSensor.DEFAULT, HeartRateSensor.DEFAULT, PowerSensor.forActivity(a), CyclingCadenceSensor.DEFAULT];
}

function byFootSensors(a: SportLike): Sensor[] {
  return [
    ElevationSensor.DEFAULT,
    PaceSensor.DEFAULT,
    HeartRateSensor.DEFAULT,
    PowerSensor.forActivity(a),
    RunningCadenceSensor.DEFAULT,
    GradeSensor.DEFAULT,
    GradeAdjustedPaceSensor.DEFAULT
  ];
}

function swimmingSensors(): Sensor[] {
  return [SwimmingPaceSensor.DEFAULT, HeartRateSensor.DEFAULT, SwimmingCadenceSensor.DEFAULT];
}

function defaultSensors(): Sensor[] {
  return [ElevationSensor.DEFAULT, SpeedSensor.DEFAULT, HeartRateSensor.DEFAULT];
}

const SPORT_SENSORS: Record<string, (a: SportLike) => Sensor[]> = {
  Ride: cyclingSensors,
  VirtualRide: cyclingSensors,
  Run: byFootSensors,
  VirtualRun: byFootSensors,
  Hike: byFootSensors,
  Walk: byFootSensors,
  Swim: swimmingSensors
};

/** Sensors of an activity's sport, optionally cherry-picked (and ordered) by stream key. */
export function provideSensors(a: SportLike, cherryPick?: (keyof Streams)[]): Sensor[] {
  const sensors = (SPORT_SENSORS[a.type] ?? defaultSensors)(a);
  if (!cherryPick?.length) return sensors;
  return cherryPick.map(k => sensors.find(s => s.streamKey === k)).filter((s): s is Sensor => !!s);
}

/** Merges "Power" and "Est. Power" flavors of a sensor (compare rows). */
export const sensorRowTitle = (s: Sensor) => s.name.replace(/^Est\. /, "");
