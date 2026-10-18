// Year progression models. Enum values and preset field names match the original Elevate app so presets
// migrated from it (stored in the "yearProgressPresets" pref) load unchanged.

export enum ProgressMode {
  YEAR_TO_DATE = 0,
  ROLLING = 1
}

export enum ProgressType {
  DISTANCE = 0,
  TIME = 1,
  ELEVATION = 2,
  COUNT = 3
}

export type RollingPeriod = "Days" | "Weeks" | "Months" | "Years";
export const ROLLING_PERIODS: RollingPeriod[] = ["Days", "Weeks", "Months", "Years"];
export const DEFAULT_ROLLING_PERIOD: RollingPeriod = "Months";
export const DEFAULT_ROLLING_MULTIPLIER = 1;

export interface ProgressConfig {
  mode: ProgressMode;
  activityTypes: string[];
  includeCommuteRide: boolean;
  includeIndoorRide: boolean;
  /** Rolling mode only: window length in days. */
  rollingDays?: number;
}

/** Old YearToDateProgressPresetModel / RollingProgressPresetModel JSON shape. */
export interface ProgressPreset {
  id: string;
  mode: ProgressMode;
  progressType: ProgressType;
  activityTypes: string[];
  includeCommuteRide: boolean;
  includeIndoorRide: boolean;
  targetValue?: number | null;
  /** Rolling presets only. */
  rollingPeriod?: string;
  periodMultiplier?: number;
  [extra: string]: unknown;
}

export interface ProgressModel {
  year: number;
  dayOfYear: number;
  distance: number; // km or mi once prepared for display
  time: number; // hours once prepared for display
  elevation: number; // m or ft once prepared for display
  count: number;
  isFuture: boolean;
}

export interface YearProgressModel {
  mode: ProgressMode;
  year: number;
  progressions: ProgressModel[];
}

export interface TargetProgressModel {
  dayOfYear: number;
  value: number;
}

export interface ProgressAtDayModel {
  date: Date;
  year: number;
  progressType: ProgressType;
  value: number;
  color: string | null;
}

export interface YearProgressTypeModel {
  type: ProgressType;
  label: string;
  unit?: string;
  shortUnit?: string;
}

/** The slim activity fields the algorithm needs. */
export interface ProgressActivityInput {
  type: string;
  startTime: string;
  commute?: boolean | null;
  trainer?: boolean | null;
  stats?: { distance?: number | null; movingTime?: number | null; elevationGain?: number | null } | null;
}

export enum DeltaType {
  POSITIVE = "deltaPositive",
  NEGATIVE = "deltaNegative",
  UNSIGNED = "deltaUnsigned",
  NAN = "deltaNaN"
}

export interface Delta {
  type: DeltaType;
  date: string | null;
  value: number | null;
  signSymbol: string | null;
  class: string;
}

export interface ProgressionAtDayRow {
  year: number;
  color: string | null;
  currentValue: number;
  progressTypeLabel: string;
  progressTypeUnit: string;
  deltaPreviousYear: Delta;
  deltaCurrentYear: Delta;
  deltaTarget: Delta | null;
}
