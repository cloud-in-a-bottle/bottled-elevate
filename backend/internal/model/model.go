// Package model holds the JSON documents the app persists and serves. Field names match the
// original Elevate TypeScript models so stats paths (eg "stats.heartRate.avg") carry over.
package model

import "math"

// Num is a nullable number: nil marshals to null, which is how the original code represented
// "not computed" (and NaN/Infinity, which JSON.stringify also turns into null).
type Num = *float64

// N wraps a value as a Num, mapping NaN/Inf to nil.
func N(v float64) Num {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	return &v
}

// NZ is N but also maps 0 to nil, mirroring the original's frequent `value || null`.
func NZ(v float64) Num {
	if v == 0 {
		return nil
	}
	return N(v)
}

// Val returns the value of a Num, or NaN when nil.
func Val(n Num) float64 {
	if n == nil {
		return math.NaN()
	}
	return *n
}

// Truthy mirrors a JS truthiness check on a nullable number.
func Truthy(n Num) bool {
	return n != nil && *n != 0 && !math.IsNaN(*n)
}

type Gender string

const (
	Men   Gender = "men"
	Women Gender = "women"
)

type MeasureSystem string

const (
	Metric   MeasureSystem = "metric"
	Imperial MeasureSystem = "imperial"
)

type Zone struct {
	From    float64 `json:"from"`
	To      float64 `json:"to"`
	S       float64 `json:"s"`
	Percent Num     `json:"percent"`
}

type Peak struct {
	Range  float64 `json:"range"`
	Result Num     `json:"result"`
	Start  int     `json:"start"`
	End    int     `json:"end"`
}

type SlopeStats struct {
	Up    Num `json:"up"`
	Flat  Num `json:"flat"`
	Down  Num `json:"down"`
	Total Num `json:"total,omitempty"`
}

type SpeedStats struct {
	Avg       Num    `json:"avg"`
	Max       Num    `json:"max"`
	Best20min Num    `json:"best20min"`
	LowQ      Num    `json:"lowQ"`
	Median    Num    `json:"median"`
	UpperQ    Num    `json:"upperQ"`
	StdDev    Num    `json:"stdDev"`
	Zones     []Zone `json:"zones"`
	Peaks     []Peak `json:"peaks"`
}

type PaceStats struct {
	Avg       Num    `json:"avg"`
	GapAvg    Num    `json:"gapAvg"`
	Max       Num    `json:"max"`
	Best20min Num    `json:"best20min"`
	LowQ      Num    `json:"lowQ"`
	Median    Num    `json:"median"`
	UpperQ    Num    `json:"upperQ"`
	StdDev    Num    `json:"stdDev"`
	Zones     []Zone `json:"zones"`
}

type PowerStats struct {
	Avg              Num    `json:"avg"`
	AvgKg            Num    `json:"avgKg"`
	Weighted         Num    `json:"weighted"`
	WeightedKg       Num    `json:"weightedKg"`
	Max              Num    `json:"max"`
	Work             Num    `json:"work"`
	Best20min        Num    `json:"best20min"`
	VariabilityIndex Num    `json:"variabilityIndex"`
	IntensityFactor  Num    `json:"intensityFactor"`
	LowQ             Num    `json:"lowQ"`
	Median           Num    `json:"median"`
	UpperQ           Num    `json:"upperQ"`
	StdDev           Num    `json:"stdDev"`
	Zones            []Zone `json:"zones"`
	Peaks            []Peak `json:"peaks"`
}

type HeartRateStats struct {
	Avg        Num    `json:"avg"`
	Max        Num    `json:"max"`
	AvgReserve Num    `json:"avgReserve"`
	MaxReserve Num    `json:"maxReserve"`
	Best20min  Num    `json:"best20min"`
	Best60min  Num    `json:"best60min"`
	LowQ       Num    `json:"lowQ"`
	Median     Num    `json:"median"`
	UpperQ     Num    `json:"upperQ"`
	StdDev     Num    `json:"stdDev"`
	Zones      []Zone `json:"zones"`
	Peaks      []Peak `json:"peaks"`
}

type CadenceStats struct {
	Avg          Num         `json:"avg"`
	Max          Num         `json:"max"`
	AvgActive    Num         `json:"avgActive"`
	ActiveRatio  Num         `json:"activeRatio"`
	ActiveTime   Num         `json:"activeTime"`
	Cycles       Num         `json:"cycles"`
	DistPerCycle Num         `json:"distPerCycle"`
	LowQ         Num         `json:"lowQ"`
	Median       Num         `json:"median"`
	UpperQ       Num         `json:"upperQ"`
	Slope        *SlopeStats `json:"slope"`
	StdDev       Num         `json:"stdDev"`
	Zones        []Zone      `json:"zones"`
	Peaks        []Peak      `json:"peaks"`
}

type GradeStats struct {
	Avg           Num         `json:"avg"`
	Max           Num         `json:"max"`
	Min           Num         `json:"min"`
	LowQ          Num         `json:"lowQ"`
	Median        Num         `json:"median"`
	UpperQ        Num         `json:"upperQ"`
	StdDev        Num         `json:"stdDev"`
	SlopeTime     *SlopeStats `json:"slopeTime"`
	SlopeSpeed    *SlopeStats `json:"slopeSpeed"`
	SlopePace     *SlopeStats `json:"slopePace"`
	SlopeDistance *SlopeStats `json:"slopeDistance"`
	SlopeCadence  *SlopeStats `json:"slopeCadence"`
	SlopeProfile  string      `json:"slopeProfile"`
	Zones         []Zone      `json:"zones"`
}

type ElevationStats struct {
	Avg            Num    `json:"avg"`
	Max            Num    `json:"max"`
	Min            Num    `json:"min"`
	Ascent         Num    `json:"ascent"`
	Descent        Num    `json:"descent"`
	AscentSpeed    Num    `json:"ascentSpeed"`
	LowQ           Num    `json:"lowQ"`
	Median         Num    `json:"median"`
	UpperQ         Num    `json:"upperQ"`
	StdDev         Num    `json:"stdDev"`
	ElevationZones []Zone `json:"elevationZones"`
}

type StressScores struct {
	Hrss        Num `json:"hrss"`
	HrssPerHour Num `json:"hrssPerHour"`
	Trimp       Num `json:"trimp"`
	TrimpPerHr  Num `json:"trimpPerHour"`
	Rss         Num `json:"rss"`
	RssPerHour  Num `json:"rssPerHour"`
	Sss         Num `json:"sss"`
	SssPerHour  Num `json:"sssPerHour"`
	Pss         Num `json:"pss"`
	PssPerHour  Num `json:"pssPerHour"`
}

type Swolf struct {
	S25 Num `json:"25"`
	S50 Num `json:"50"`
}

type Scores struct {
	Stress        StressScores `json:"stress"`
	Efficiency    Num          `json:"efficiency"`
	PowerHr       Num          `json:"powerHr"`
	RunningRating Num          `json:"runningRating"`
	Swolf         *Swolf       `json:"swolf"`
}

type ActivityStats struct {
	Distance        Num             `json:"distance"`
	ElevationGain   Num             `json:"elevationGain"`
	ElapsedTime     Num             `json:"elapsedTime"`
	MovingTime      Num             `json:"movingTime"`
	PauseTime       Num             `json:"pauseTime"`
	MoveRatio       Num             `json:"moveRatio"`
	Calories        Num             `json:"calories"`
	CaloriesPerHour Num             `json:"caloriesPerHour"`
	Scores          *Scores         `json:"scores"`
	Speed           *SpeedStats     `json:"speed"`
	Pace            *PaceStats      `json:"pace"`
	Power           *PowerStats     `json:"power"`
	HeartRate       *HeartRateStats `json:"heartRate"`
	Cadence         *CadenceStats   `json:"cadence"`
	Grade           *GradeStats     `json:"grade"`
	Elevation       *ElevationStats `json:"elevation"`
}

// SourceStats are the scalar summaries the health-data provider reported. They win over
// stream-derived stats where set (eg a watch's own distance beats a GPS-integrated one).
type SourceStats struct {
	Distance        Num `json:"distance,omitempty"`
	ElevationGain   Num `json:"elevationGain,omitempty"`
	ElapsedTime     Num `json:"elapsedTime,omitempty"`
	MovingTime      Num `json:"movingTime,omitempty"`
	Calories        Num `json:"calories,omitempty"`
	CaloriesPerHour Num `json:"caloriesPerHour,omitempty"`
	AvgSpeed        Num `json:"avgSpeed,omitempty"` // kph
	AvgPace         Num `json:"avgPace,omitempty"`  // s/km
	AvgHr           Num `json:"avgHr,omitempty"`
	MaxHr           Num `json:"maxHr,omitempty"`
}

type Lap struct {
	ID            int    `json:"id"`
	Active        bool   `json:"active"`
	Indexes       [2]int `json:"indexes"`
	Distance      Num    `json:"distance,omitempty"`
	ElevationGain Num    `json:"elevationGain,omitempty"`
	ElapsedTime   Num    `json:"elapsedTime,omitempty"`
	MovingTime    Num    `json:"movingTime,omitempty"`
	AvgSpeed      Num    `json:"avgSpeed,omitempty"`
	MaxSpeed      Num    `json:"maxSpeed,omitempty"`
	AvgPace       Num    `json:"avgPace,omitempty"`
	AvgHr         Num    `json:"avgHr,omitempty"`
	MaxHr         Num    `json:"maxHr,omitempty"`
	AvgWatts      Num    `json:"avgWatts,omitempty"`
	AvgCadence    Num    `json:"avgCadence,omitempty"`
}

type LactateThreshold struct {
	Default Num `json:"default"`
	Cycling Num `json:"cycling"`
	Running Num `json:"running"`
}

type AthleteSettings struct {
	MaxHr      float64          `json:"maxHr"`
	RestHr     float64          `json:"restHr"`
	Lthr       LactateThreshold `json:"lthr"`
	CyclingFtp Num              `json:"cyclingFtp"`
	RunningFtp Num              `json:"runningFtp"` // s/km threshold pace
	SwimFtp    Num              `json:"swimFtp"`    // m/min
	Weight     float64          `json:"weight"`
}

type DatedAthleteSettings struct {
	// Since is YYYY-MM-DD; nil means "forever" (the oldest period).
	Since *string `json:"since"`
	AthleteSettings
}

type Athlete struct {
	Gender               Gender                 `json:"gender"`
	DatedAthleteSettings []DatedAthleteSettings `json:"datedAthleteSettings"`
	FirstName            *string                `json:"firstName"`
	LastName             *string                `json:"lastName"`
	BirthDate            *string                `json:"birthDate"`
	PracticeLevel        *string                `json:"practiceLevel"`
	Sports               []string               `json:"sports"`
}

type AthleteSnapshot struct {
	Gender          Gender          `json:"gender"`
	Age             Num             `json:"age"`
	AthleteSettings AthleteSettings `json:"athleteSettings"`
}

func DefaultAthleteSettings() AthleteSettings {
	return AthleteSettings{MaxHr: 190, RestHr: 65, Weight: 70}
}

func DefaultAthlete() Athlete {
	return Athlete{
		Gender:               Men,
		DatedAthleteSettings: []DatedAthleteSettings{{Since: nil, AthleteSettings: DefaultAthleteSettings()}},
		Sports:               []string{},
	}
}

type UserZones struct {
	Speed          []float64 `json:"speed"`
	Pace           []float64 `json:"pace"`
	HeartRate      []float64 `json:"heartRate"`
	Power          []float64 `json:"power"`
	RunningPower   []float64 `json:"runningPower"`
	CyclingCadence []float64 `json:"cyclingCadence"`
	RunningCadence []float64 `json:"runningCadence"`
	Grade          []float64 `json:"grade"`
	Elevation      []float64 `json:"elevation"`
	Ascent         []float64 `json:"ascent"`
}

type UserSettings struct {
	SystemUnit      MeasureSystem `json:"systemUnit"`
	TemperatureUnit string        `json:"temperatureUnit"`
	Zones           UserZones     `json:"zones"`
}

func DefaultZones() UserZones {
	return UserZones{
		Speed:          []float64{0, 10, 15, 20, 25, 27, 30, 32, 34, 36, 38, 40, 42, 44, 47, 50, 60, 75},
		Pace:           []float64{60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420, 450, 480, 540, 570, 720, 900},
		HeartRate:      []float64{95, 114, 133, 152, 171, 190, 209},
		Power:          []float64{0, 50, 100, 150, 175, 200, 225, 250, 300, 325, 350, 375, 400, 425, 450, 475, 500, 600, 800, 1500},
		RunningPower:   []float64{0, 50, 100, 150, 175, 200, 225, 250, 300, 325, 350, 375, 400, 425, 450, 475, 500, 600, 800, 1500},
		CyclingCadence: []float64{0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 125, 150},
		RunningCadence: []float64{65, 67, 69, 71, 73, 75, 77, 79, 81, 83, 85, 87, 89, 91, 93, 95, 97, 99, 101, 103, 105, 107, 109, 111, 115, 120},
		Grade:          []float64{-20, -17, -14, -12, -9, -6, -3, -2, -1, -0.5, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 25},
		Elevation:      []float64{0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000},
		Ascent:         []float64{0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200, 3400, 3600, 3800, 4000, 4200, 4400, 4600, 4800, 5000, 6000},
	}
}

func DefaultUserSettings() UserSettings {
	return UserSettings{SystemUnit: Metric, TemperatureUnit: "C", Zones: DefaultZones()}
}

// Activity is one workout as the app displays it. Stats are derived (ActivityComputer over the
// streams, overlaid with SrcStats); everything needed to re-derive them is kept alongside, so a
// change of athlete settings or zones can recompute every activity server-side.
type Activity struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	Type            string          `json:"type"`
	StartTime       string          `json:"startTime"`
	EndTime         string          `json:"endTime"`
	StartTimestamp  int64           `json:"startTimestamp"`
	EndTimestamp    int64           `json:"endTimestamp"`
	HasPowerMeter   bool            `json:"hasPowerMeter"`
	Trainer         bool            `json:"trainer"`
	Commute         bool            `json:"commute"`
	IsSwimPool      bool            `json:"isSwimPool"`
	HasStreams      bool            `json:"hasStreams"`
	HasMap          bool            `json:"hasMap"`
	AthleteSnapshot AthleteSnapshot `json:"athleteSnapshot"`
	Stats           ActivityStats   `json:"stats"`
	SrcStats        *SourceStats    `json:"srcStats,omitempty"`
	SettingsLack    bool            `json:"settingsLack"`
	Hash            string          `json:"hash"`
	CreationTime    string          `json:"creationTime"`
	LastEditTime    string          `json:"lastEditTime"`
	Device          string          `json:"device"`
	Notes           string          `json:"notes"`
	ProviderID      string          `json:"providerId"`
	Source          string          `json:"source"`
	WorkoutType     string          `json:"workoutType"`
	UserEditedType  bool            `json:"userEditedType,omitempty"`
	UserEditedName  bool            `json:"userEditedName,omitempty"`
	Laps            []Lap           `json:"laps,omitempty"`
	LatLngCenter    []float64       `json:"latLngCenter,omitempty"`
}

// Streams are per-sample series aligned on Time (seconds from start).
type Streams struct {
	Time               []float64    `json:"time,omitempty"`
	Distance           []float64    `json:"distance,omitempty"`
	VelocitySmooth     []float64    `json:"velocity_smooth,omitempty"`
	Altitude           []float64    `json:"altitude,omitempty"`
	Cadence            []float64    `json:"cadence,omitempty"`
	Heartrate          []float64    `json:"heartrate,omitempty"`
	Watts              []float64    `json:"watts,omitempty"`
	LatLng             [][2]float64 `json:"latlng,omitempty"`
	GradeSmooth        []float64    `json:"grade_smooth,omitempty"`
	GradeAdjustedSpeed []float64    `json:"grade_adjusted_speed,omitempty"`
}

func (s *Streams) IsEmpty() bool {
	return s == nil || (len(s.Time) == 0 && len(s.Distance) == 0 && len(s.VelocitySmooth) == 0 &&
		len(s.Altitude) == 0 && len(s.Cadence) == 0 && len(s.Heartrate) == 0 && len(s.Watts) == 0 &&
		len(s.LatLng) == 0 && len(s.GradeSmooth) == 0 && len(s.GradeAdjustedSpeed) == 0)
}

func (s *Streams) Clone() *Streams {
	if s == nil {
		return nil
	}
	c := func(a []float64) []float64 {
		if a == nil {
			return nil
		}
		return append([]float64(nil), a...)
	}
	out := &Streams{
		Time: c(s.Time), Distance: c(s.Distance), VelocitySmooth: c(s.VelocitySmooth), Altitude: c(s.Altitude),
		Cadence: c(s.Cadence), Heartrate: c(s.Heartrate), Watts: c(s.Watts), GradeSmooth: c(s.GradeSmooth),
		GradeAdjustedSpeed: c(s.GradeAdjustedSpeed),
	}
	if s.LatLng != nil {
		out.LatLng = append([][2]float64(nil), s.LatLng...)
	}
	return out
}
