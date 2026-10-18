// Stat definitions, groups and display (port of shared/models/stats/* and ActivityStatsService).
import dayjs from "dayjs";
import { getPath, isNum } from "../../../lib/format";
import type { Activity, MeasureSystem } from "../../../lib/types";
import {
  BaseSensor,
  CyclingCadenceSensor,
  DistanceSensor,
  ElevationAscentSpeedSensor,
  ElevationSensor,
  GradeSensor,
  HeartRateSensor,
  PaceSensor,
  PowerSensor,
  RunningCadenceSensor,
  RunningDistanceSensor,
  Sensor,
  SpeedSensor,
  SwimDistanceSensor,
  SwimmingCadenceSensor,
  SwimmingPaceSensor,
  TimeSensor,
  VoidSensor
} from "./sensors";

export class Stat {
  /** undefined: use the sensor unit; null: no unit. */
  unit: string | null | undefined = undefined;
  factor = 1;
  missingMessage: string | null = null;
  forceDisplay = false;
  readonly name: string;

  constructor(
    readonly sensor: BaseSensor,
    name: string,
    /** Dotted path on the activity, eg "stats.heartRate.avg". */
    readonly path: string,
    readonly description: string | null = null,
    readonly roundDecimals: number | null = null
  ) {
    this.name = sensor.isEstimated ? `Est. ${name}` : name;
  }

  noUnit(): this {
    this.unit = null;
    return this;
  }
  setUnit(u: string): this {
    this.unit = u;
    return this;
  }
  setFactor(f: number): this {
    this.factor = f;
    return this;
  }
  force(): this {
    this.forceDisplay = true;
    return this;
  }
  missing(message: string): this {
    this.missingMessage = message;
    return this;
  }

  resolveUnit(ms: MeasureSystem): string | null {
    if (this.unit !== undefined) return this.unit;
    return this.sensor.displayUnit(ms);
  }

  value(a: Activity): unknown {
    return getPath(a, this.path);
  }
}

const GRADE_CLIMBING_LIMIT = 1.5;
const GRADE_DOWNHILL_LIMIT = -1.5;
const UNDER_20 = "Empty because activity under 20 min";
const missingFtp = (sport: string, kind: string, start: string) =>
  `${sport} threshold ${kind} required on ${dayjs(start).format("MMM D YYYY")} (athlete settings)`;

const s = (sensor: BaseSensor, name: string, path: string, description: string | null = null, decimals: number | null = null) =>
  new Stat(sensor, name, `stats.${path}`, description, decimals);

const UP = `over ${GRADE_CLIMBING_LIMIT}% grade`;
const FLAT = `between ${GRADE_DOWNHILL_LIMIT}% and ${GRADE_CLIMBING_LIMIT}% grade`;
const DOWN = `under ${GRADE_DOWNHILL_LIMIT}% grade`;

/** Stat definitions (StatsDef namespace). Functions take what varies per activity. */
export const StatsDef = {
  Generic: {
    movingTime: s(TimeSensor.DEFAULT, "Moving Time", "movingTime"),
    elapsedTime: s(TimeSensor.DEFAULT, "Elapsed Time", "elapsedTime"),
    calories: s(VoidSensor.DEFAULT, "Calories", "calories"),
    caloriesPerHour: s(VoidSensor.DEFAULT, "Calories / Hour", "caloriesPerHour"),
    moveRatio: s(VoidSensor.DEFAULT, "Move Ratio", "moveRatio", "Moving / Elapsed time ratio", 2),
    ascentGain: s(ElevationSensor.DEFAULT, "Ascent Gain", "elevationGain")
  },
  Distance: {
    distance: s(DistanceSensor.DEFAULT, "Distance", "distance"),
    running: s(RunningDistanceSensor.DEFAULT, "Distance", "distance"),
    swimming: s(SwimDistanceSensor.DEFAULT, "Distance", "distance")
  },
  Speed: {
    avg: s(SpeedSensor.DEFAULT, "Average", "speed.avg", "Average speed"),
    max: s(SpeedSensor.DEFAULT, "Max", "speed.max"),
    threshold: s(SpeedSensor.DEFAULT, "Threshold", "speed.best20min", "Best speed held during 20 min").force().missing(UNDER_20),
    avgPace: s(PaceSensor.DEFAULT, "Average Pace", "pace.avg"),
    q25: s(SpeedSensor.DEFAULT, "25% Quartile", "speed.lowQ"),
    q50: s(SpeedSensor.DEFAULT, "50% Quartile", "speed.median", "Equals to median"),
    q75: s(SpeedSensor.DEFAULT, "75% Quartile", "speed.upperQ"),
    stdDev: s(SpeedSensor.DEFAULT, "Std Deviation σ", "speed.stdDev", "Standard deviation")
  },
  RunPace: {
    avg: s(PaceSensor.DEFAULT, "Average", "pace.avg", "Average pace"),
    max: s(PaceSensor.DEFAULT, "Fastest", "pace.max"),
    threshold: s(PaceSensor.DEFAULT, "Threshold", "pace.best20min", "Best pace held during 20 min").force().missing(UNDER_20),
    gap: s(PaceSensor.DEFAULT, "Grade Adj. Pace", "pace.gapAvg", "Equals your avg pace performed on a flat slope"),
    q25: s(PaceSensor.DEFAULT, "25% Quartile", "pace.lowQ"),
    q50: s(PaceSensor.DEFAULT, "50% Quartile", "pace.median", "Equals to median"),
    q75: s(PaceSensor.DEFAULT, "75% Quartile", "pace.upperQ"),
    stdDev: s(SpeedSensor.DEFAULT, "Std Deviation σ", "speed.stdDev", "Standard deviation")
  },
  SwimPace: {
    avg: s(SwimmingPaceSensor.DEFAULT, "Average", "pace.avg", "Average time / hundred meters or yards"),
    max: s(SwimmingPaceSensor.DEFAULT, "Fastest", "pace.max", "Fastest time / hundred meters or yards"),
    threshold: s(SwimmingPaceSensor.DEFAULT, "Threshold", "pace.best20min", "Best pace held during 20 min").force().missing(UNDER_20),
    q25: s(SwimmingPaceSensor.DEFAULT, "25% Quartile", "pace.lowQ", "Lower quartile time / hundred meters or yards"),
    q50: s(SwimmingPaceSensor.DEFAULT, "50% Quartile", "pace.median", "Median time / hundred meters or yards"),
    q75: s(SwimmingPaceSensor.DEFAULT, "75% Quartile", "pace.upperQ", "Upper quartile time / hundred meters or yards")
  },
  HeartRate: {
    avg: s(HeartRateSensor.DEFAULT, "Average", "heartRate.avg"),
    max: s(HeartRateSensor.DEFAULT, "Max", "heartRate.max"),
    threshold: s(HeartRateSensor.DEFAULT, "Threshold", "heartRate.best20min", "Best heart rate held during 20 min (LTHR)")
      .force()
      .missing(UNDER_20),
    thresholdHour: s(HeartRateSensor.DEFAULT, "Threshold 60 min", "heartRate.best60min", "Best heart rate held during 60 min")
      .force()
      .missing("Empty because activity under 60 min"),
    hrr: s(HeartRateSensor.DEFAULT, "HRR", "heartRate.avgReserve", "Heart Rate Reserve").setUnit("%"),
    maxHrr: s(HeartRateSensor.DEFAULT, "Max HRR", "heartRate.maxReserve", "Max Heart Rate Reserve reached").setUnit("%"),
    q25: s(HeartRateSensor.DEFAULT, "25% Quartile", "heartRate.lowQ"),
    q50: s(HeartRateSensor.DEFAULT, "50% Quartile", "heartRate.median", "Equals to median"),
    q75: s(HeartRateSensor.DEFAULT, "75% Quartile", "heartRate.upperQ"),
    stdDev: s(HeartRateSensor.DEFAULT, "Std Deviation σ", "heartRate.stdDev")
  },
  Power: {
    avg: (p: PowerSensor) => s(p, "Average", "power.avg"),
    avgKg: (p: PowerSensor) => s(p, "Average /kg", "power.avgKg", "Average watts / kilograms", 2).setUnit("w/kg"),
    weighted: (p: PowerSensor) => s(p, "Avg NP®", "power.weighted", "Avg Normalized Power®"),
    weightedKg: (p: PowerSensor) => s(p, "Avg NP® /kg", "power.weightedKg", "Avg Normalized Power® / kilograms", 2).setUnit("w/kg"),
    max: (p: PowerSensor) => s(p, "Max", "power.max"),
    work: (p: PowerSensor) => s(p, "Work", "power.work", "Work in Kilojoules").setUnit("kJ"),
    threshold: (p: PowerSensor) => s(p, "Threshold", "power.best20min", "Best power held during 20 min").force().missing(UNDER_20),
    variabilityIndex: (p: PowerSensor) =>
      s(p, "VI", "power.variabilityIndex", "Variability Index or activity pace (Normalized Power® / Average Power)", 2).noUnit(),
    intensity: (p: PowerSensor, start: string) =>
      s(p, "IF®", "power.intensityFactor", "Intensity Factor® (Normalized Power® / Functional Power Threshold)", 2)
        .noUnit()
        .force()
        .missing(missingFtp("Cycling", "power", start)),
    q25: (p: PowerSensor) => s(p, "25% Quartile", "power.lowQ"),
    q50: (p: PowerSensor) => s(p, "50% Quartile", "power.median", "Equals to median"),
    q75: (p: PowerSensor) => s(p, "75% Quartile", "power.upperQ"),
    stdDev: (p: PowerSensor) => s(p, "Std Deviation σ", "power.stdDev")
  },
  CyclingCadence: {
    avg: s(CyclingCadenceSensor.DEFAULT, "Average", "cadence.avg", "Average cadence inc. freewheeling"),
    activeAvg: s(CyclingCadenceSensor.DEFAULT, "Active Average", "cadence.avgActive", "Average cadence with legs moving"),
    max: s(CyclingCadenceSensor.DEFAULT, "Max", "cadence.max"),
    pedalingTime: s(TimeSensor.DEFAULT, "Pedaling Time", "cadence.activeTime", "Active pedaling time"),
    pedalingRatio: s(CyclingCadenceSensor.DEFAULT, "Pedaling Ratio", "cadence.activeRatio", "Pedaling VS Freewheel ratio", 2).noUnit(),
    avgClimb: s(CyclingCadenceSensor.DEFAULT, "Avg Climbing", "cadence.slope.up"),
    avgFlat: s(CyclingCadenceSensor.DEFAULT, "Avg Flat", "cadence.slope.flat"),
    avgDown: s(CyclingCadenceSensor.DEFAULT, "Avg Downhill", "cadence.slope.down"),
    stdDev: s(CyclingCadenceSensor.DEFAULT, "Std Deviation σ", "cadence.stdDev"),
    cycles: s(VoidSensor.DEFAULT, "Rev. Count", "cadence.cycles", "Crankset revolutions count").noUnit(),
    q25: s(CyclingCadenceSensor.DEFAULT, "25% Quartile", "cadence.lowQ"),
    q50: s(CyclingCadenceSensor.DEFAULT, "50% Quartile", "cadence.median", "Equals to median"),
    q75: s(CyclingCadenceSensor.DEFAULT, "75% Quartile", "cadence.upperQ"),
    distPerCycle: s(VoidSensor.DEFAULT, "Avg Dist. / Rev.", "cadence.distPerCycle", "Average distance / crankset revolution", 2).setUnit("m")
  },
  RunningCadence: {
    avg: s(RunningCadenceSensor.DEFAULT, "Average", "cadence.avg", "Average strides inc. walking & pauses (2 legs)"),
    activeAvg: s(RunningCadenceSensor.DEFAULT, "Active Average", "cadence.avgActive", "Average strides while running (2 legs)"),
    max: s(RunningCadenceSensor.DEFAULT, "Max", "cadence.max", "Max strides (2 legs)"),
    avgClimb: s(RunningCadenceSensor.DEFAULT, "Avg Climbing", "cadence.slope.up", "Average strides while climbing (2 legs)"),
    avgFlat: s(RunningCadenceSensor.DEFAULT, "Avg Flat", "cadence.slope.flat", "Average strides on flat (2 legs)"),
    avgDown: s(RunningCadenceSensor.DEFAULT, "Avg Downhill", "cadence.slope.down", "Average strides on downhills (2 legs)"),
    stdDev: s(RunningCadenceSensor.DEFAULT, "Std Deviation σ", "cadence.stdDev", "Standard deviation (2 legs)"),
    cycles: s(VoidSensor.DEFAULT, "Strides Count", "cadence.cycles", "Single strides count").noUnit(),
    q25: s(RunningCadenceSensor.DEFAULT, "25% Quartile", "cadence.lowQ", "25% quartile (2 legs)"),
    q50: s(RunningCadenceSensor.DEFAULT, "50% Quartile", "cadence.median", "50% quartile or median (2 legs)"),
    q75: s(RunningCadenceSensor.DEFAULT, "75% Quartile", "cadence.upperQ", "75% quartile (2 legs)"),
    distPerCycle: s(VoidSensor.DEFAULT, "Avg Dist. / Stride", "cadence.distPerCycle", "Average distance per single stride", 2).setUnit("m")
  },
  SwimmingCadence: {
    activeAvg: s(SwimmingCadenceSensor.DEFAULT, "Average", "cadence.avgActive", "Average strokes per minutes"),
    avg: s(SwimmingCadenceSensor.DEFAULT, "Average", "cadence.avg", "Average strokes per minutes inc. pauses"),
    max: s(SwimmingCadenceSensor.DEFAULT, "Max", "cadence.max", "Max strokes"),
    stdDev: s(SwimmingCadenceSensor.DEFAULT, "Std Deviation σ", "cadence.stdDev", "Standard deviation"),
    cycles: s(VoidSensor.DEFAULT, "Strokes Count", "cadence.cycles", "Strokes count").noUnit(),
    q25: s(SwimmingCadenceSensor.DEFAULT, "25% Quartile", "cadence.lowQ", "25% quartile"),
    q50: s(SwimmingCadenceSensor.DEFAULT, "50% Quartile", "cadence.median", "50% quartile or median"),
    q75: s(SwimmingCadenceSensor.DEFAULT, "75% Quartile", "cadence.upperQ", "75% quartile"),
    distPerCycle: s(VoidSensor.DEFAULT, "Avg Dist. / Stroke", "cadence.distPerCycle", "Average distance per stroke", 2).setUnit("m")
  },
  Elevation: {
    ascent: s(ElevationSensor.DEFAULT, "Ascent Gain", "elevation.ascent"),
    descent: s(ElevationSensor.DEFAULT, "Descent Gain", "elevation.descent"),
    max: s(ElevationSensor.DEFAULT, "Max", "elevation.max"),
    min: s(ElevationSensor.DEFAULT, "Min", "elevation.min"),
    avgVertSpeed: s(
      ElevationAscentSpeedSensor.DEFAULT,
      "Avg Ascend Speed",
      "elevation.ascentSpeed",
      "Average vertical climbed meters or feet / hour"
    ),
    q25: s(ElevationSensor.DEFAULT, "25% Quartile", "elevation.lowQ"),
    q50: s(ElevationSensor.DEFAULT, "50% Quartile", "elevation.median", "Equals to median"),
    q75: s(ElevationSensor.DEFAULT, "75% Quartile", "elevation.upperQ")
  },
  Grade: {
    profile: s(GradeSensor.DEFAULT, "Profile", "grade.slopeProfile").noUnit(),
    avg: s(GradeSensor.DEFAULT, "Average", "grade.avg"),
    max: s(GradeSensor.DEFAULT, "Max", "grade.max"),
    min: s(GradeSensor.DEFAULT, "Min", "grade.min"),
    timeUp: s(TimeSensor.DEFAULT, "Climbing Time", "grade.slopeTime.up", `Climbing time ${UP}`),
    timeFlat: s(TimeSensor.DEFAULT, "Flat Time", "grade.slopeTime.flat", `Time on flat ${FLAT}`),
    timeDown: s(TimeSensor.DEFAULT, "Downhill Time", "grade.slopeTime.down", `Time in downhills ${DOWN}`),
    distUp: s(DistanceSensor.DEFAULT, "Climbing Distance", "grade.slopeDistance.up", `Climbing distance ${UP}`),
    distFlat: s(DistanceSensor.DEFAULT, "Flat Distance", "grade.slopeDistance.flat", `Distance on flat ${FLAT}`),
    distDown: s(DistanceSensor.DEFAULT, "Downhill Distance", "grade.slopeDistance.down", `Distance in downhills ${DOWN}`),
    speedUp: s(SpeedSensor.DEFAULT, "Climbing Speed", "grade.slopeSpeed.up", `Climbing speed ${UP}`),
    speedFlat: s(SpeedSensor.DEFAULT, "Flat Speed", "grade.slopeSpeed.flat", `Speed on flat ${FLAT}`),
    speedDown: s(SpeedSensor.DEFAULT, "Downhill Speed", "grade.slopeSpeed.down", `Speed in downhills ${DOWN}`),
    cadenceUp: s(CyclingCadenceSensor.DEFAULT, "Climbing Cadence", "grade.slopeCadence.up", `Climbing cadence ${UP}`),
    cadenceFlat: s(CyclingCadenceSensor.DEFAULT, "Flat Cadence", "grade.slopeCadence.flat", `Cadence on flat ${FLAT}`),
    cadenceDown: s(CyclingCadenceSensor.DEFAULT, "Downhill Cadence", "grade.slopeCadence.down", `Cadence in downhills ${DOWN}`),
    q25: s(GradeSensor.DEFAULT, "25% Quartile", "grade.lowQ", "25% quartile"),
    q50: s(GradeSensor.DEFAULT, "50% Quartile", "grade.median", "50% quartile or median"),
    q75: s(GradeSensor.DEFAULT, "75% Quartile", "grade.upperQ", "75% quartile"),
    stdDev: s(GradeSensor.DEFAULT, "Std Deviation σ", "grade.stdDev", "Standard deviation"),
    runPaceUp: s(PaceSensor.DEFAULT, "Climbing Pace", "grade.slopePace.up", `Climbing pace ${UP}`),
    runPaceFlat: s(PaceSensor.DEFAULT, "Flat Pace", "grade.slopePace.flat", `Pace on flat ${FLAT}`),
    runPaceDown: s(PaceSensor.DEFAULT, "Downhill Pace", "grade.slopePace.down", `Pace in downhills ${DOWN}`),
    runCadenceUp: s(RunningCadenceSensor.DEFAULT, "Climbing Cadence", "grade.slopeCadence.up", `Climbing cadence ${UP}`),
    runCadenceFlat: s(RunningCadenceSensor.DEFAULT, "Flat Cadence", "grade.slopeCadence.flat", `Cadence on flat ${FLAT}`),
    runCadenceDown: s(RunningCadenceSensor.DEFAULT, "Downhill Cadence", "grade.slopeCadence.down", `Cadence in downhills ${DOWN}`)
  },
  Scores: {
    efficiency: s(
      VoidSensor.DEFAULT,
      "Efficiency Factor",
      "scores.efficiency",
      'Efficiency Factor is your "Normalized Power® / Average Heart rate" ("Input Power / Output HR"). Higher value means better aerobic fit.',
      2
    ).noUnit(),
    powerHr: s(
      VoidSensor.DEFAULT,
      "Power/Hr",
      "scores.powerHr",
      "Avg power over avg heart rate. A higher value means you produced more power for a given heart rate.",
      2
    ).noUnit(),
    hrss: s(HeartRateSensor.DEFAULT, "HRSS", "scores.stress.hrss", "Heart Rate Stress Score").noUnit(),
    hrssPerHour: s(HeartRateSensor.DEFAULT, "HRSS / Hour", "scores.stress.hrssPerHour", "Heart Rate Stress Score / Hour").noUnit(),
    trimp: s(HeartRateSensor.DEFAULT, "TRIMP", "scores.stress.trimp", "TRaining IMPulse").noUnit(),
    trimpPerHour: s(HeartRateSensor.DEFAULT, "TRIMP / Hour", "scores.stress.trimpPerHour", "TRaining IMPulse / Hour").noUnit(),
    pss: (p: PowerSensor, start: string) =>
      s(p, "PSS", "scores.stress.pss", "Power Stress Score").noUnit().force().missing(missingFtp("Cycling", "power", start)),
    pssPerHour: (p: PowerSensor, start: string) =>
      s(p, "PSS / Hour", "scores.stress.pssPerHour", "Power Stress Score / Hour").noUnit().force().missing(missingFtp("Cycling", "power", start)),
    rss: (start: string) =>
      s(VoidSensor.DEFAULT, "RSS", "scores.stress.rss", "Running Stress Score").force().missing(missingFtp("Running", "pace", start)),
    rssPerHour: (start: string) =>
      s(VoidSensor.DEFAULT, "RSS / Hour", "scores.stress.rssPerHour", "Running Stress Score / Hour")
        .force()
        .missing(missingFtp("Running", "pace", start)),
    sss: (start: string) =>
      s(VoidSensor.DEFAULT, "SSS", "scores.stress.sss", "Swimming Stress Score").force().missing(missingFtp("Swimming", "pace", start)),
    sssPerHour: (start: string) =>
      s(VoidSensor.DEFAULT, "SSS / Hour", "scores.stress.sssPerHour", "Swimming Stress Score / Hour")
        .force()
        .missing(missingFtp("Swimming", "pace", start)),
    runningRating: s(
      VoidSensor.DEFAULT,
      "Running Rating",
      "scores.runningRating",
      '"Running Rating" is an equivalent of "Running Index" from Polar',
      1
    )
      .force()
      .missing("Activity don't match requirements to compute Running Rating"),
    swolf25: s(VoidSensor.DEFAULT, "SWOLF 25m", "scores.swolf.25", "Swimming efficiency normalized to a 25 meters pool"),
    swolf50: s(VoidSensor.DEFAULT, "SWOLF 50m", "scores.swolf.50", "Swimming efficiency normalized to a 50 meters pool")
  }
};

// ---------------------------------------------------------------------------------------------
// Groups

export interface StatsGroup {
  name: string;
  /** Sensor whose color marks the group, if any. */
  sensor: Sensor | null;
  stats: Stat[];
}

const D = StatsDef;

const ESSENTIAL_BASE = [
  D.Generic.movingTime,
  D.Generic.elapsedTime,
  D.Generic.moveRatio,
  D.Scores.efficiency,
  D.Scores.powerHr,
  D.Generic.calories,
  D.Generic.caloriesPerHour
];

const essential = (head: Stat[], tail: Stat[] = []): StatsGroup => ({
  name: "Essential",
  sensor: null,
  stats: [...head, ...ESSENTIAL_BASE, ...tail]
});

const speedGroup = (): StatsGroup => ({
  name: SpeedSensor.DEFAULT.name,
  sensor: SpeedSensor.DEFAULT,
  stats: [D.Speed.avg, D.Speed.max, D.Speed.threshold, D.Speed.avgPace, D.Speed.q25, D.Speed.q50, D.Speed.q75, D.Speed.stdDev]
});

const heartRateGroup = (): StatsGroup => ({
  name: HeartRateSensor.DEFAULT.name,
  sensor: HeartRateSensor.DEFAULT,
  stats: [
    D.HeartRate.avg,
    D.HeartRate.max,
    D.Scores.hrss,
    D.Scores.hrssPerHour,
    D.Scores.trimp,
    D.Scores.trimpPerHour,
    D.HeartRate.threshold,
    D.HeartRate.thresholdHour,
    D.HeartRate.hrr,
    D.HeartRate.maxHrr,
    D.HeartRate.q25,
    D.HeartRate.q50,
    D.HeartRate.q75,
    D.HeartRate.stdDev
  ]
});

const elevationGroup = (): StatsGroup => ({
  name: ElevationSensor.DEFAULT.name,
  sensor: ElevationSensor.DEFAULT,
  stats: [
    D.Elevation.ascent,
    D.Elevation.descent,
    D.Elevation.max,
    D.Elevation.min,
    D.Elevation.avgVertSpeed,
    D.Elevation.q25,
    D.Elevation.q50,
    D.Elevation.q75
  ]
});

const G = D.Grade;
const gradeGroup = (running: boolean): StatsGroup => ({
  name: GradeSensor.DEFAULT.name,
  sensor: GradeSensor.DEFAULT,
  stats: [
    G.profile,
    G.timeUp,
    G.timeFlat,
    G.timeDown,
    G.distUp,
    G.distFlat,
    G.distDown,
    ...(running
      ? [G.runPaceUp, G.runPaceFlat, G.runPaceDown, G.runCadenceUp, G.runCadenceFlat, G.runCadenceDown]
      : [G.speedUp, G.speedFlat, G.speedDown, G.cadenceUp, G.cadenceFlat, G.cadenceDown]),
    G.avg,
    G.max,
    G.min,
    G.q25,
    G.q50,
    G.q75,
    G.stdDev
  ]
});

function powerGroup(a: Activity, cycling: boolean): StatsGroup {
  const p = PowerSensor.forActivity(a);
  const P = D.Power;
  return {
    name: p.name,
    sensor: p,
    stats: [
      P.avg(p),
      P.avgKg(p),
      P.weighted(p),
      P.weightedKg(p),
      P.max(p),
      P.work(p),
      P.threshold(p),
      ...(cycling ? [D.Scores.pss(p, a.startTime), D.Scores.pssPerHour(p, a.startTime), P.intensity(p, a.startTime)] : []),
      P.variabilityIndex(p),
      P.q25(p),
      P.q50(p),
      P.q75(p),
      P.stdDev(p)
    ]
  };
}

function cyclingGroups(a: Activity): StatsGroup[] {
  const C = D.CyclingCadence;
  return [
    essential([D.Distance.distance, D.Generic.ascentGain]),
    speedGroup(),
    heartRateGroup(),
    powerGroup(a, true),
    {
      name: "Cadence",
      sensor: CyclingCadenceSensor.DEFAULT,
      stats: [C.activeAvg, C.avg, C.max, C.pedalingTime, C.pedalingRatio, C.avgClimb, C.avgFlat, C.avgDown, C.cycles, C.distPerCycle, C.q25, C.q50, C.q75, C.stdDev]
    },
    elevationGroup(),
    gradeGroup(false)
  ];
}

function runningGroups(a: Activity): StatsGroup[] {
  const C = D.RunningCadence;
  const R = D.RunPace;
  return [
    essential([D.Distance.running, D.Generic.ascentGain], [D.Scores.runningRating]),
    {
      name: PaceSensor.DEFAULT.name,
      sensor: PaceSensor.DEFAULT,
      stats: [R.avg, R.gap, R.max, R.threshold, R.q25, R.q50, R.q75, R.stdDev, D.Scores.rss(a.startTime), D.Scores.rssPerHour(a.startTime)]
    },
    heartRateGroup(),
    powerGroup(a, false),
    {
      name: "Cadence",
      sensor: RunningCadenceSensor.DEFAULT,
      stats: [C.activeAvg, C.avg, C.max, C.avgClimb, C.avgFlat, C.avgDown, C.cycles, C.stdDev, C.q25, C.q50, C.q75, C.distPerCycle]
    },
    elevationGroup(),
    gradeGroup(true)
  ];
}

function swimmingGroups(a: Activity): StatsGroup[] {
  const C = D.SwimmingCadence;
  const P = D.SwimPace;
  return [
    essential([D.Distance.swimming], [D.Scores.swolf25, D.Scores.swolf50]),
    {
      name: SwimmingPaceSensor.DEFAULT.name,
      sensor: SwimmingPaceSensor.DEFAULT,
      stats: [P.avg, P.max, P.threshold, P.q25, P.q50, P.q75, D.Scores.sss(a.startTime), D.Scores.sssPerHour(a.startTime)]
    },
    heartRateGroup(),
    {
      name: "Cadence",
      sensor: SwimmingCadenceSensor.DEFAULT,
      stats: [C.activeAvg, C.avg, C.max, C.cycles, C.stdDev, C.q25, C.q50, C.q75, C.distPerCycle]
    }
  ];
}

function defaultGroups(): StatsGroup[] {
  return [essential([D.Distance.distance, D.Generic.ascentGain]), speedGroup(), heartRateGroup(), elevationGroup(), gradeGroup(false)];
}

const SPORT_GROUPS: Record<string, (a: Activity) => StatsGroup[]> = {
  Ride: cyclingGroups,
  VirtualRide: cyclingGroups,
  Run: runningGroups,
  VirtualRun: runningGroups,
  Hike: runningGroups,
  Swim: swimmingGroups
};

export function statsGroups(a: Activity): StatsGroup[] {
  return (SPORT_GROUPS[a.type] ?? defaultGroups)(a);
}

// ---------------------------------------------------------------------------------------------
// Summary (3x3 tiles): each pool contributes its first stat that has a value.

const SUMMARY_SIZE = 9;

function summaryPools(a: Activity): (Stat | null)[][] {
  const start = a.startTime;
  const type = a.type;
  if (type === "Ride" || type === "VirtualRide") {
    const p = PowerSensor.forActivity(a);
    const real = !p.isEstimated;
    return [
      [D.Distance.distance],
      [D.Generic.movingTime, D.Generic.elapsedTime],
      [D.Elevation.ascent, D.Generic.moveRatio],
      [D.Speed.avg],
      [D.HeartRate.avg, D.Speed.max],
      [D.CyclingCadence.activeAvg, D.HeartRate.hrr, D.Speed.q75],
      [real ? D.Power.threshold(p) : null, D.HeartRate.threshold, D.Speed.threshold],
      [real ? D.Scores.pss(p, start) : null, D.Scores.hrss, D.Generic.calories],
      [real ? D.Scores.pssPerHour(p, start) : null, D.Scores.hrssPerHour, D.Generic.caloriesPerHour],
      [D.Elevation.avgVertSpeed]
    ];
  }
  if (type === "Run" || type === "VirtualRun" || type === "Hike") {
    const p = PowerSensor.forActivity(a);
    return [
      [D.Distance.running],
      [D.Generic.movingTime, D.Generic.elapsedTime],
      [D.Elevation.ascent, D.Generic.moveRatio],
      [D.RunPace.avg],
      [D.HeartRate.avg, D.RunPace.gap],
      [D.RunningCadence.activeAvg, D.HeartRate.hrr, D.RunPace.q75],
      [D.HeartRate.threshold, D.RunPace.threshold, D.Power.threshold(p)],
      [D.Scores.hrss, D.Scores.rss(start), D.Generic.calories],
      [D.Scores.hrssPerHour, D.Scores.rssPerHour(start), D.Generic.caloriesPerHour],
      [D.Elevation.avgVertSpeed]
    ];
  }
  if (type === "Swim") {
    return [
      [D.Distance.swimming],
      [D.Generic.movingTime, D.Generic.elapsedTime],
      [D.Scores.swolf25, D.Generic.moveRatio],
      [D.SwimPace.avg],
      [D.HeartRate.avg, D.SwimPace.max],
      [D.SwimmingCadence.activeAvg, D.HeartRate.hrr, D.SwimPace.q75],
      [D.HeartRate.threshold, D.SwimPace.threshold],
      [D.Scores.hrss, D.Scores.sss(start), D.Generic.calories],
      [D.Scores.hrssPerHour, D.Scores.sssPerHour(start), D.Generic.caloriesPerHour],
      [D.SwimmingCadence.distPerCycle]
    ];
  }
  return [
    [D.Distance.distance],
    [D.Generic.movingTime, D.Generic.elapsedTime],
    [D.Elevation.ascent, D.Generic.moveRatio],
    [D.Speed.avg],
    [D.HeartRate.avg, D.Speed.max],
    [D.CyclingCadence.activeAvg, D.HeartRate.hrr, D.Speed.q75],
    [D.HeartRate.threshold, D.Speed.threshold],
    [D.Scores.hrss, D.Generic.calories],
    [D.Scores.hrssPerHour, D.Generic.caloriesPerHour]
  ];
}

export function summaryStats(a: Activity): Stat[] {
  const out: Stat[] = [];
  for (const pool of summaryPools(a)) {
    if (out.length >= SUMMARY_SIZE) break;
    const found = pool.find(st => {
      const v = st?.value(a);
      return v !== null && v !== undefined;
    });
    if (found) out.push(found);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Display

export interface StatDisplay {
  name: string;
  value: string;
  unit: string | null;
  description: string | null;
  missing: boolean;
  sensor: Sensor | null;
}

/** Formats a stat value of an activity (StatDisplay.create). */
export function displayStat(stat: Stat, a: Activity, ms: MeasureSystem): StatDisplay {
  const raw = stat.value(a);
  let value: string;
  let missing = false;
  if (isNum(raw)) {
    value = String(stat.sensor.formatFromStat(raw * stat.factor, ms, stat.roundDecimals || stat.sensor.defaultRoundDecimals));
  } else if (typeof raw === "string") {
    value = raw;
  } else {
    value = "-";
    missing = true;
  }
  const sensor = stat.sensor instanceof Sensor ? stat.sensor : null;
  return {
    name: stat.name,
    value,
    unit: stat.resolveUnit(ms),
    description: missing && stat.missingMessage ? stat.missingMessage : stat.description,
    missing,
    sensor
  };
}

const hasValue = (v: unknown) => isNum(v) || typeof v === "string";

/** Displays of a group's stats; empty when none of the group's stats has a value. */
export function displayGroup(group: StatsGroup, a: Activity, ms: MeasureSystem): StatDisplay[] {
  let empty = true;
  const out: StatDisplay[] = [];
  for (const stat of group.stats) {
    const exists = hasValue(stat.value(a));
    if (exists) empty = false;
    if (exists || stat.forceDisplay) out.push(displayStat(stat, a, ms));
  }
  return empty ? [] : out;
}
