// Wire types served by the Go backend (backend/internal/model). Field names match the original
// Elevate models, so stat paths like "stats.heartRate.avg" are unchanged.

export type Num = number | null;

export type Gender = "men" | "women";
export type MeasureSystem = "metric" | "imperial";
export type Temperature = "C" | "F";

export interface Zone {
  from: number;
  to: number;
  s: number;
  percent: Num;
}

export interface Peak {
  range: number;
  result: Num;
  start: number;
  end: number;
}

export interface SlopeStats {
  up: Num;
  flat: Num;
  down: Num;
  total?: Num;
}

export interface SpeedStats {
  avg: Num;
  max: Num;
  best20min: Num;
  lowQ: Num;
  median: Num;
  upperQ: Num;
  stdDev: Num;
  zones: Zone[] | null;
  peaks: Peak[] | null;
}

export interface PaceStats {
  avg: Num;
  gapAvg: Num;
  max: Num;
  best20min: Num;
  lowQ: Num;
  median: Num;
  upperQ: Num;
  stdDev: Num;
  zones: Zone[] | null;
}

export interface PowerStats {
  avg: Num;
  avgKg: Num;
  weighted: Num;
  weightedKg: Num;
  max: Num;
  work: Num;
  best20min: Num;
  variabilityIndex: Num;
  intensityFactor: Num;
  lowQ: Num;
  median: Num;
  upperQ: Num;
  stdDev: Num;
  zones: Zone[] | null;
  peaks: Peak[] | null;
}

export interface HeartRateStats {
  avg: Num;
  max: Num;
  avgReserve: Num;
  maxReserve: Num;
  best20min: Num;
  best60min: Num;
  lowQ: Num;
  median: Num;
  upperQ: Num;
  stdDev: Num;
  zones: Zone[] | null;
  peaks: Peak[] | null;
}

export interface CadenceStats {
  avg: Num;
  max: Num;
  avgActive: Num;
  activeRatio: Num;
  activeTime: Num;
  cycles: Num;
  distPerCycle: Num;
  lowQ: Num;
  median: Num;
  upperQ: Num;
  slope: SlopeStats | null;
  stdDev: Num;
  zones: Zone[] | null;
  peaks: Peak[] | null;
}

export interface GradeStats {
  avg: Num;
  max: Num;
  min: Num;
  lowQ: Num;
  median: Num;
  upperQ: Num;
  stdDev: Num;
  slopeTime: SlopeStats | null;
  slopeSpeed: SlopeStats | null;
  slopePace: SlopeStats | null;
  slopeDistance: SlopeStats | null;
  slopeCadence: SlopeStats | null;
  slopeProfile: "FLAT" | "HILLY";
  zones: Zone[] | null;
}

export interface ElevationStats {
  avg: Num;
  max: Num;
  min: Num;
  ascent: Num;
  descent: Num;
  ascentSpeed: Num;
  lowQ: Num;
  median: Num;
  upperQ: Num;
  stdDev: Num;
  elevationZones: Zone[] | null;
}

export interface StressScores {
  hrss: Num;
  hrssPerHour: Num;
  trimp: Num;
  trimpPerHour: Num;
  rss: Num;
  rssPerHour: Num;
  sss: Num;
  sssPerHour: Num;
  pss: Num;
  pssPerHour: Num;
}

export interface Scores {
  stress: StressScores;
  efficiency: Num;
  powerHr: Num;
  runningRating: Num;
  swolf: { 25: Num; 50: Num } | null;
}

export interface ActivityStats {
  distance: Num; // meters
  elevationGain: Num; // meters
  elapsedTime: Num; // seconds
  movingTime: Num; // seconds
  pauseTime: Num;
  moveRatio: Num;
  calories: Num;
  caloriesPerHour: Num;
  scores: Scores | null;
  speed: SpeedStats | null; // kph
  pace: PaceStats | null; // s/km
  power: PowerStats | null;
  heartRate: HeartRateStats | null;
  cadence: CadenceStats | null;
  grade: GradeStats | null;
  elevation: ElevationStats | null;
}

export interface Lap {
  id: number;
  active: boolean;
  indexes: [number, number];
  distance?: number;
  elevationGain?: number;
  elapsedTime?: number;
  movingTime?: number;
  avgSpeed?: number; // kph
  maxSpeed?: number; // kph
  avgPace?: number; // s/km
  avgHr?: number;
  maxHr?: number;
  avgWatts?: number;
  avgCadence?: number;
}

export interface LactateThreshold {
  default: Num;
  cycling: Num;
  running: Num;
}

export interface AthleteSettings {
  maxHr: number;
  restHr: number;
  lthr: LactateThreshold;
  cyclingFtp: Num; // watts
  runningFtp: Num; // threshold pace, s/km
  swimFtp: Num; // m/min
  weight: number; // kg
}

export interface DatedAthleteSettings extends AthleteSettings {
  since: string | null; // YYYY-MM-DD; null = forever (oldest period)
}

export interface Athlete {
  gender: Gender;
  datedAthleteSettings: DatedAthleteSettings[];
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null; // YYYY-MM-DD
  practiceLevel: string | null;
  sports: string[];
}

export interface AthleteSnapshot {
  gender: Gender;
  age: Num;
  athleteSettings: AthleteSettings;
}

export interface UserZones {
  speed: number[];
  pace: number[];
  heartRate: number[];
  power: number[];
  runningPower: number[];
  cyclingCadence: number[];
  runningCadence: number[];
  grade: number[];
  elevation: number[];
  ascent: number[];
}

export type ZoneType = keyof UserZones;

export interface UserSettings {
  systemUnit: MeasureSystem;
  temperatureUnit: Temperature;
  zones: UserZones;
}

export interface Activity {
  id: string;
  name: string;
  type: string; // ElevateSport
  startTime: string; // ISO
  endTime: string;
  startTimestamp: number; // epoch seconds
  endTimestamp: number;
  hasPowerMeter: boolean;
  trainer: boolean;
  commute: boolean;
  isSwimPool: boolean;
  hasStreams: boolean;
  hasMap: boolean;
  athleteSnapshot: AthleteSnapshot;
  stats: ActivityStats;
  srcStats?: Record<string, Num>;
  settingsLack: boolean;
  hash: string;
  creationTime: string;
  lastEditTime: string;
  device: string;
  notes: string;
  providerId: string;
  source: string;
  workoutType: string;
  laps?: Lap[]; // detail endpoint only
  latLngCenter?: [number, number];
}

export interface Streams {
  time?: number[]; // seconds from start
  distance?: number[]; // meters
  velocity_smooth?: number[]; // m/s
  altitude?: number[]; // meters
  cadence?: number[];
  heartrate?: number[];
  watts?: number[];
  latlng?: [number, number][];
  grade_smooth?: number[]; // %
  grade_adjusted_speed?: number[]; // m/s
}

export type SyncMode = "fast" | "full" | "force";

export interface SyncStatus {
  state: "NOT_SYNCED" | "PARTIALLY_SYNCED" | "SYNCED";
  running: boolean;
  job?: "sync" | "recompute";
  done: number;
  total: number;
  lastSyncTime: string | null;
  lastError?: string;
  activities: number;
  revision: number;
}
