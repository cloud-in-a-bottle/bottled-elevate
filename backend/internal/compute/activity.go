package compute

import (
	"math"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
)

const (
	rnd                         = 3
	defaultLthrKarvonenHrrRatio = 0.85
	gradeClimbingLimit          = 1.5
	gradeDownhillLimit          = -gradeClimbingLimit
	gradeFlatProfileThreshold   = 60.0
	elevationDeltaThreshold     = 2.0
	weightedWattsTimeBuffer     = 30.0
)

var n = model.N

func r(v float64, p int) model.Num { return model.N(Round(v, p)) }

// ActivityInput is what the computer needs to know about an activity.
type ActivityInput struct {
	Type          string
	HasPowerMeter bool
	IsSwimPool    bool
}

type computer struct {
	sport     string
	settings  model.UserSettings
	snapshot  model.AthleteSnapshot
	streams   *model.Streams
	isMoving  func(kph float64) bool
	isActive  func(cadence float64) bool
	withZones bool
	withPeaks bool
}

func movingThreshold(sport string) float64 {
	switch {
	case model.IsRide(sport, false):
		return 4
	case model.IsRun(sport):
		return 1.5
	case model.IsSwim(sport):
		return 0.5
	}
	return 0.3
}

func cadenceThreshold(sport string) float64 {
	switch {
	case model.IsRide(sport, false):
		return 30
	case model.IsRun(sport):
		return 50
	case model.IsSwim(sport):
		return 10
	}
	return 1
}

// ComputeStats derives every activity stat from raw streams (Elevate's ActivityComputer).
// Streams are shaped with ProcessStreams first; the caller's streams are left untouched.
func ComputeStats(a ActivityInput, snapshot model.AthleteSnapshot, settings model.UserSettings, raw *model.Streams, withPeaks, withZones bool) model.ActivityStats {
	var streams *model.Streams
	if !raw.IsEmpty() {
		streams = ProcessStreams(raw, StreamParams{
			Type: a.Type, HasPowerMeter: a.HasPowerMeter, IsSwimPool: a.IsSwimPool, Weight: snapshot.AthleteSettings.Weight,
		})
	}
	mt, ct := movingThreshold(a.Type), cadenceThreshold(a.Type)
	c := &computer{
		sport: a.Type, settings: settings, snapshot: snapshot, streams: streams,
		isMoving:  func(kph float64) bool { return kph > mt },
		isActive:  func(cad float64) bool { return cad > ct },
		withZones: withZones, withPeaks: withPeaks,
	}
	return c.computeStats()
}

func (c *computer) computeStats() model.ActivityStats {
	s := c.streams
	if s == nil {
		s = &model.Streams{}
	}
	isCycling := model.IsRide(c.sport, false)
	isRunning := model.IsRun(c.sport)
	isSwimming := model.IsSwim(c.sport)
	weight := c.snapshot.AthleteSettings.Weight

	elapsed, moving, pause, moveRatio := math.NaN(), math.NaN(), math.NaN(), math.NaN()
	if len(s.Time) > 0 {
		elapsed = Last(s.Time)
	}

	var grade *model.GradeStats
	if !isSwimming {
		grade = c.gradeStats(s.Time, s.GradeSmooth, s.VelocitySmooth, s.Cadence)
	}

	speed, pace, movingTime := c.moveStats(s.Time, s.Distance, s.VelocitySmooth, s.GradeAdjustedSpeed)
	if movingTime > 0 {
		moving = movingTime
	}
	if elapsed > 0 && !(moving > 0) {
		moving = elapsed
	}
	if !(elapsed > 0) && moving > 0 {
		elapsed = moving
	}
	if elapsed > 0 && moving > 0 {
		pause = elapsed - moving
		moveRatio = moving / elapsed
	}

	distance := math.NaN()
	if len(s.Distance) > 0 {
		distance = Last(s.Distance)
	}

	var power *model.PowerStats
	switch {
	case isCycling:
		power = c.powerStats(s.Time, s.Watts, weight, model.Val(c.snapshot.AthleteSettings.CyclingFtp), moving, "power")
	case isRunning && len(s.Watts) > 0:
		power = c.powerStats(s.Time, s.Watts, weight, math.NaN(), moving, "runningPower")
	case isRunning && len(s.GradeAdjustedSpeed) > 0:
		s.Watts = RunningPowerStream(weight, s.GradeAdjustedSpeed)
		power = c.powerStats(s.Time, s.Watts, weight, math.NaN(), moving, "runningPower")
	default:
		power = c.powerStats(s.Time, s.Watts, weight, math.NaN(), moving, "")
	}

	hr := c.heartRateStats(s.Time, s.Heartrate)

	var cadence *model.CadenceStats
	if len(s.Cadence) > 0 {
		zone := ""
		if isCycling {
			zone = "cyclingCadence"
		} else if isRunning {
			zone = "runningCadence"
		}
		cadence = c.cadenceStats(s.Time, s.Distance, s.Cadence, moving, zone)
	}
	if cadence != nil && grade != nil && grade.SlopeCadence != nil {
		cadence.Slope = grade.SlopeCadence
	}

	elevation := c.elevationStats(s.Time, s.Distance, s.Altitude)

	avgWatts, avgHr := math.NaN(), math.NaN()
	if power != nil {
		avgWatts = model.Val(power.Avg)
	}
	if hr != nil {
		avgHr = model.Val(hr.Avg)
	}
	calories := EstimateCalories(c.sport, moving, weight, model.Val(c.snapshot.Age), c.snapshot.Gender, avgWatts, avgHr)
	caloriesPerHour := math.NaN()
	if finite(calories) {
		caloriesPerHour = calories / elapsed * SecHourFactor
	}

	stats := model.ActivityStats{
		Distance:        n(distance),
		MoveRatio:       r(moveRatio, rnd),
		ElapsedTime:     n(elapsed),
		MovingTime:      n(moving),
		PauseTime:       n(pause),
		Calories:        r(calories, 0),
		CaloriesPerHour: r(caloriesPerHour, rnd),
		Speed:           speed,
		Pace:            pace,
		Power:           power,
		HeartRate:       hr,
		Cadence:         cadence,
		Grade:           grade,
		Elevation:       elevation,
	}
	if elevation != nil && model.Truthy(elevation.Ascent) {
		stats.ElevationGain = elevation.Ascent
	}
	stats.Scores = c.computeScores(&stats)
	return stats
}

// TrainingImpulse is Banister's TRIMP.
func TrainingImpulse(seconds, hrrPercent float64, gender model.Gender) float64 {
	factor := 1.92
	if gender != model.Men {
		factor = 1.67
	}
	ratio := hrrPercent / 100
	return (seconds / 60) * ratio * 0.64 * math.Exp(factor*ratio)
}

func HeartRateReserveRatio(hr, maxHr, restHr float64) float64 {
	return math.Max((hr-restHr)/(maxHr-restHr), 0)
}

// HeartRateStressScore is TRIMP normalized to an hour at lactate threshold. NaN when undefined.
func HeartRateStressScore(gender model.Gender, maxHr, restHr, lthr, trimp float64) float64 {
	reserve := (lthr - restHr) / (maxHr - restHr)
	factor := 1.92
	if gender != model.Men {
		factor = 1.67
	}
	lthrTrimp := 60 * reserve * 0.64 * math.Exp(factor*reserve)
	v := trimp / lthrTrimp * 100
	if v == 0 || !finite(v) {
		return math.NaN()
	}
	return v
}

func PowerStressScore(movingTime, weightedPower, threshold float64) float64 {
	if !(threshold > 0) {
		return math.NaN()
	}
	intensity := weightedPower / threshold
	return movingTime * weightedPower * intensity / (threshold * SecHourFactor) * 100
}

func RunningStressScore(movingTime, gapPace, thresholdPace float64) float64 {
	gapSpeed := 1 / gapPace
	thresholdSpeed := 1 / thresholdPace
	intensity := gapSpeed / thresholdSpeed
	return movingTime * gapSpeed * intensity / (thresholdSpeed * SecHourFactor) * 100
}

func SwimStressScore(distance, movingTime, elapsedTime, swimFtp float64) float64 {
	normalized := distance / (movingTime / 60)
	intensity := normalized / swimFtp
	return math.Pow(intensity, 3) * (elapsedTime / SecHourFactor) * 100
}

// ResolveLTHR picks the sport's lactate threshold HR, falling back to a Karvonen estimate.
func ResolveLTHR(sport string, s model.AthleteSettings) float64 {
	if model.IsRide(sport, true) && s.Lthr.Cycling != nil {
		return *s.Lthr.Cycling
	}
	if model.IsRun(sport) && s.Lthr.Running != nil {
		return *s.Lthr.Running
	}
	if s.Lthr.Default != nil {
		return *s.Lthr.Default
	}
	return s.RestHr + defaultLthrKarvonenHrrRatio*(s.MaxHr-s.RestHr)
}

// NormalizedPower is Coggan's weighted power over 30s buckets.
func NormalizedPower(power, time []float64) float64 {
	var weighted []float64
	acc := 0.0
	var buf []float64
	for i := 1; i < len(time) && i < len(power); i++ {
		buf = append(buf, power[i])
		if acc >= weightedWattsTimeBuffer {
			m := Mean(buf)
			if finite(m) {
				weighted = append(weighted, math.Pow(m, 4))
			}
			acc = 0
			buf = buf[:0]
		}
		acc += time[i] - time[i-1]
	}
	return math.Sqrt(math.Sqrt(Mean(weighted)))
}

func swimSwolf(secondsPer100m, avgStrokesPerMin, poolLength float64) float64 {
	minutesPer100m := secondsPer100m / 60
	strokesPerMeter := avgStrokesPerMin * minutesPer100m / 100
	secondsPerMeter := secondsPer100m / 100
	return Round((secondsPerMeter+strokesPerMeter)*poolLength, 1)
}

// RunningRating is an equivalent of Polar's running index; NaN when requirements aren't met.
func RunningRating(snapshot model.AthleteSnapshot, stats *model.ActivityStats, time, distance, velocity []float64) float64 {
	nan := math.NaN()
	if !model.Truthy(stats.MovingTime) || stats.HeartRate == nil || !model.Truthy(stats.HeartRate.Avg) ||
		stats.Pace == nil || !model.Truthy(stats.Pace.GapAvg) || snapshot.AthleteSettings.MaxHr == 0 ||
		len(time) == 0 || len(distance) == 0 || len(velocity) == 0 {
		return nan
	}
	movingTime := *stats.MovingTime
	avgHr := *stats.HeartRate.Avg
	maxHr := snapshot.AthleteSettings.MaxHr
	if stats.Elevation != nil && stats.Elevation.AscentSpeed != nil && *stats.Elevation.AscentSpeed > 2200 {
		return nan
	}
	if avgHr > maxHr {
		return nan
	}
	if stats.HeartRate.StdDev != nil && *stats.HeartRate.StdDev == 0 {
		return nan
	}
	if res := stats.HeartRate.AvgReserve; res != nil && (*res < 52 || *res > 98) {
		return nan
	}
	if timeSplit(velocity, time, 60*12)*MpsKphFactor < 6 {
		return nan
	}
	gapMps := PaceToSpeed(*stats.Pace.GapAvg) / MpsKphFactor
	gaDistance := math.Max(gapMps*movingTime, Last(distance))
	distanceRate := (213.9/(movingTime/60))*math.Pow(gaDistance/1000, 1.06) + 3.5
	intensity := math.Min(avgHr/maxHr*1.45-0.3, 1)
	v := Round(distanceRate/intensity, rnd)
	if v == 0 {
		return nan
	}
	return v
}

func (c *computer) computeScores(stats *model.ActivityStats) *model.Scores {
	sc := &model.Scores{}
	as := c.snapshot.AthleteSettings
	moving := model.Val(stats.MovingTime)

	trimp := math.NaN()
	if stats.HeartRate != nil && model.Truthy(stats.HeartRate.AvgReserve) {
		trimp = TrainingImpulse(moving, *stats.HeartRate.AvgReserve, c.snapshot.Gender)
	}
	sc.Stress.Trimp = model.NZ(trimp)
	if sc.Stress.Trimp != nil {
		sc.Stress.TrimpPerHr = n(trimp / moving * SecHourFactor)
	}

	hrss := HeartRateStressScore(c.snapshot.Gender, as.MaxHr, as.RestHr, ResolveLTHR(c.sport, as), trimp)
	sc.Stress.Hrss = model.NZ(hrss)
	if sc.Stress.Hrss != nil {
		sc.Stress.HrssPerHour = n(hrss / moving * SecHourFactor)
	}

	if stats.Pace != nil && model.Truthy(stats.Pace.GapAvg) && model.Truthy(as.RunningFtp) {
		rss := Round(RunningStressScore(moving, *stats.Pace.GapAvg, *as.RunningFtp), rnd)
		sc.Stress.Rss = model.NZ(rss)
		if sc.Stress.Rss != nil {
			sc.Stress.RssPerHour = r(rss/moving*SecHourFactor, rnd)
		}
	}

	if model.IsSwim(c.sport) && model.Truthy(stats.Distance) && moving > 0 && model.Truthy(as.SwimFtp) {
		sss := Round(SwimStressScore(*stats.Distance, moving, model.Val(stats.ElapsedTime), *as.SwimFtp), rnd)
		sc.Stress.Sss = model.NZ(sss)
		if sc.Stress.Sss != nil {
			sc.Stress.SssPerHour = r(sss/moving*SecHourFactor, rnd)
		}
	}

	if model.IsRide(c.sport, false) && moving > 0 && stats.Power != nil && model.Truthy(stats.Power.Weighted) && model.Truthy(as.CyclingFtp) {
		pss := Round(PowerStressScore(moving, *stats.Power.Weighted, *as.CyclingFtp), rnd)
		sc.Stress.Pss = model.NZ(pss)
		if sc.Stress.Pss != nil {
			sc.Stress.PssPerHour = r(pss/moving*SecHourFactor, rnd)
		}
	}

	if model.IsRun(c.sport) && c.streams != nil && len(c.streams.Time) > 0 && len(c.streams.Distance) > 0 && len(c.streams.VelocitySmooth) > 0 {
		sc.RunningRating = model.NZ(RunningRating(c.snapshot, stats, c.streams.Time, c.streams.Distance, c.streams.VelocitySmooth))
	}

	if stats.Power != nil && stats.HeartRate != nil && model.Truthy(stats.HeartRate.Avg) {
		if model.Truthy(stats.Power.Weighted) {
			sc.Efficiency = r(*stats.Power.Weighted / *stats.HeartRate.Avg, rnd)
		}
		if model.Truthy(stats.Power.Avg) {
			sc.PowerHr = r(*stats.Power.Avg / *stats.HeartRate.Avg, rnd)
		}
	}

	if model.IsSwim(c.sport) && stats.Speed != nil && model.Truthy(stats.Speed.Avg) && stats.Cadence != nil && model.Truthy(stats.Cadence.AvgActive) {
		per100 := SpeedToSwimPace(*stats.Speed.Avg)
		sc.Swolf = &model.Swolf{
			S25: n(swimSwolf(per100, *stats.Cadence.AvgActive, 25)),
			S50: n(swimSwolf(per100, *stats.Cadence.AvgActive, 50)),
		}
	}
	return sc
}

func (c *computer) moveStats(time, distance, velocity, gradeAdjSpeeds []float64) (*model.SpeedStats, *model.PaceStats, float64) {
	if len(time) == 0 || len(distance) == 0 || len(velocity) == 0 {
		return nil, nil, math.NaN()
	}
	kph := make([]float64, len(velocity))
	var movingKph []float64
	for i, v := range velocity {
		kph[i] = v * MpsKphFactor
		if c.isMoving(kph[i]) {
			movingKph = append(movingKph, kph[i])
		}
	}
	avgSpeed := Mean(kph)
	avgMovingSpeed := Mean(movingKph)
	movingTime := math.Min(Last(distance)/(avgMovingSpeed/MpsKphFactor), Last(time))
	stdDev := standardDeviation(kph, avgSpeed)
	q25, q50, q75 := quartiles(kph)
	best20 := timeSplit(velocity, time, 60*20) * MpsKphFactor
	if best20 == 0 {
		best20 = math.NaN()
	}

	speed := &model.SpeedStats{
		Avg:       r(avgSpeed, rnd),
		Max:       r(Max(velocity)*MpsKphFactor, rnd),
		Best20min: r(best20, rnd),
		LowQ:      r(q25, rnd),
		Median:    r(q50, rnd),
		UpperQ:    r(q75, rnd),
		StdDev:    r(stdDev, rnd),
	}
	if c.withZones {
		speed.Zones = c.zones(kph, time, c.settings.Zones.Speed)
	}
	if c.withPeaks {
		speed.Peaks = TimePeaks(time, velocity)
	}

	gap := math.NaN()
	if len(gradeAdjSpeeds) > 0 {
		g := Mean(gradeAdjSpeeds) * MpsKphFactor
		if !(g > avgSpeed) {
			g = avgSpeed
		}
		gap = Round(SpeedToPace(g), 0)
	}
	paceOf := func(p model.Num) model.Num { return r(SpeedToPace(model.Val(p)), 0) }
	pace := &model.PaceStats{
		Avg:       r(SpeedToPace(avgSpeed), 0),
		GapAvg:    n(gap),
		Max:       paceOf(speed.Max),
		Best20min: r(SpeedToPace(best20), 0),
		LowQ:      paceOf(speed.LowQ),
		Median:    paceOf(speed.Median),
		UpperQ:    paceOf(speed.UpperQ),
		StdDev:    model.NZ(Round(SpeedToPace(stdDev), 0)),
	}
	if c.withZones {
		paces := make([]float64, len(kph))
		for i, v := range kph {
			paces[i] = SpeedToPace(v)
		}
		pace.Zones = c.zones(paces, time, c.settings.Zones.Pace)
	}
	return speed, pace, movingTime
}

func meanIsZero(a []float64) bool { return Mean(a) == 0 }

func (c *computer) powerStats(time, power []float64, weight, threshold, movingTime float64, zoneType string) *model.PowerStats {
	if len(power) == 0 || len(time) == 0 || meanIsZero(power) {
		return nil
	}
	maxW := Max(power)
	avg := Mean(power)
	np := NormalizedPower(power, time)
	q25, q50, q75 := quartiles(power)
	best20 := timeSplit(power, time, 60*20)
	p := &model.PowerStats{
		Avg:              r(avg, rnd),
		AvgKg:            r(avg/weight, rnd),
		Weighted:         r(np, rnd),
		WeightedKg:       r(np/weight, rnd),
		Max:              r(maxW, rnd),
		Best20min:        model.NZ(best20),
		VariabilityIndex: r(np/avg, rnd),
		LowQ:             r(q25, rnd),
		Median:           r(q50, rnd),
		UpperQ:           r(q75, rnd),
		StdDev:           r(standardDeviation(power, avg), rnd),
	}
	if movingTime > 0 {
		p.Work = n(math.Round(avg * movingTime / 1000))
	}
	if threshold > 0 {
		p.IntensityFactor = model.NZ(Round(np/threshold, rnd))
	}
	if c.withZones && zoneType != "" {
		if zoneType == "power" {
			p.Zones = c.zones(power, time, c.settings.Zones.Power)
		} else {
			p.Zones = c.zones(power, time, c.settings.Zones.RunningPower)
		}
	}
	if c.withPeaks {
		p.Peaks = TimePeaks(time, power)
	}
	return p
}

func (c *computer) heartRateStats(time, hr []float64) *model.HeartRateStats {
	if len(time) == 0 || len(hr) == 0 || meanIsZero(hr) {
		return nil
	}
	as := c.snapshot.AthleteSettings
	avg := Mean(hr)
	maxHr := Max(hr)
	q25, q50, q75 := quartiles(hr)
	h := &model.HeartRateStats{
		Avg:        r(avg, 0),
		Max:        r(maxHr, 0),
		AvgReserve: r(HeartRateReserveRatio(avg, as.MaxHr, as.RestHr)*100, rnd),
		MaxReserve: r(HeartRateReserveRatio(maxHr, as.MaxHr, as.RestHr)*100, rnd),
		Best20min:  model.NZ(timeSplit(hr, time, 60*20)),
		Best60min:  model.NZ(timeSplit(hr, time, 60*60)),
		LowQ:       r(q25, rnd),
		Median:     r(q50, rnd),
		UpperQ:     r(q75, rnd),
		StdDev:     r(standardDeviation(hr, avg), rnd),
	}
	if c.withZones {
		h.Zones = c.zones(hr, time, c.settings.Zones.HeartRate)
	}
	if c.withPeaks {
		h.Peaks = TimePeaks(time, hr)
	}
	return h
}

func (c *computer) cadenceStats(time, distance, cadence []float64, movingSeconds float64, zoneType string) *model.CadenceStats {
	if len(cadence) == 0 || len(time) == 0 || meanIsZero(cadence) {
		return nil
	}
	var active, activeDurations []float64
	for i := 1; i < len(cadence) && i < len(time); i++ {
		if c.isActive(cadence[i]) {
			active = append(active, cadence[i])
			activeDurations = append(activeDurations, time[i]-time[i-1])
		}
	}
	avgActive := Mean(active)
	activeDuration := math.Min(Sum(activeDurations), movingSeconds)
	cycles := avgActive * activeDuration / 60
	q25, q50, q75 := quartiles(active)
	factor := 1.0
	if zoneType == "runningCadence" {
		factor = 2
	}
	cs := &model.CadenceStats{
		Avg:          r(Mean(cadence), rnd),
		Max:          n(Max(cadence)),
		AvgActive:    r(avgActive, rnd),
		ActiveRatio:  r(activeDuration/movingSeconds, rnd),
		ActiveTime:   r(activeDuration, rnd),
		Cycles:       r(cycles, 0),
		DistPerCycle: r(Last(distance)/cycles/factor, rnd),
		LowQ:         r(q25, rnd),
		Median:       r(q50, rnd),
		UpperQ:       r(q75, rnd),
		StdDev:       r(standardDeviation(active, avgActive), rnd),
	}
	if c.withZones {
		switch zoneType {
		case "cyclingCadence":
			cs.Zones = c.zones(cadence, time, c.settings.Zones.CyclingCadence)
		case "runningCadence":
			cs.Zones = c.zones(cadence, time, c.settings.Zones.RunningCadence)
		}
	}
	if c.withPeaks {
		cs.Peaks = TimePeaks(time, cadence)
	}
	return cs
}

type slopeBuckets struct{ up, flat, down []float64 }

func (b *slopeBuckets) add(grade, v float64) {
	switch {
	case grade > gradeClimbingLimit:
		b.up = append(b.up, v)
	case grade < gradeDownhillLimit:
		b.down = append(b.down, v)
	default:
		b.flat = append(b.flat, v)
	}
}

func nonEmpty(a []float64, f func([]float64) float64) model.Num {
	if len(a) == 0 {
		return nil
	}
	return r(f(a), rnd)
}

func (c *computer) gradeStats(time, grade, velocity, cadence []float64) *model.GradeStats {
	if len(time) == 0 || len(grade) == 0 || len(velocity) == 0 {
		return nil
	}
	var durations, distances, speeds, cadences slopeBuckets
	for i := 1; i < len(grade) && i < len(time) && i < len(velocity); i++ {
		g := grade[i]
		seconds := time[i] - time[i-1]
		mps := velocity[i]
		durations.add(g, seconds)
		if meters := mps * seconds; finite(meters) {
			distances.add(g, meters)
		}
		if kph := mps * MpsKphFactor; finite(kph) {
			speeds.add(g, kph)
		}
		if i < len(cadence) && finite(cadence[i]) && c.isActive(cadence[i]) {
			cadences.add(g, cadence[i])
		}
	}
	total := Last(time)
	avg := Mean(grade)
	q25, q50, q75 := quartiles(grade)

	slopeTime := &model.SlopeStats{
		Up: r(Sum(durations.up), rnd), Flat: r(Sum(durations.flat), rnd), Down: r(Sum(durations.down), rnd), Total: n(total),
	}
	slopeSpeed := &model.SlopeStats{Up: r(Mean(speeds.up), rnd), Flat: r(Mean(speeds.flat), rnd), Down: r(Mean(speeds.down), rnd)}
	paceOf := func(p model.Num) model.Num { return r(SpeedToPace(model.Val(p)), 0) }
	profile := "HILLY"
	if model.Val(slopeTime.Flat)/total*100 >= gradeFlatProfileThreshold {
		profile = "FLAT"
	}
	gs := &model.GradeStats{
		Avg: r(avg, rnd), Max: n(Max(grade)), Min: n(Min(grade)),
		LowQ: r(q25, rnd), Median: r(q50, rnd), UpperQ: r(q75, rnd),
		StdDev:    r(standardDeviation(grade, avg), rnd),
		SlopeTime: slopeTime, SlopeSpeed: slopeSpeed,
		SlopePace:     &model.SlopeStats{Up: paceOf(slopeSpeed.Up), Flat: paceOf(slopeSpeed.Flat), Down: paceOf(slopeSpeed.Down)},
		SlopeDistance: &model.SlopeStats{Up: nonEmpty(distances.up, Sum), Flat: nonEmpty(distances.flat, Sum), Down: nonEmpty(distances.down, Sum)},
		SlopeCadence:  &model.SlopeStats{Up: nonEmpty(cadences.up, Mean), Flat: nonEmpty(cadences.flat, Mean), Down: nonEmpty(cadences.down, Mean)},
		SlopeProfile:  profile,
	}
	if c.withZones {
		gs.Zones = c.zones(grade, time, c.settings.Zones.Grade)
	}
	return gs
}

// elevationGain sums climbs (sign=+1) or descents (sign=-1) of at least the delta threshold,
// returning the total elevation and the time spent on those sections.
func elevationGain(altitude, time []float64, sign float64) (gain, duration float64) {
	if len(altitude) == 0 {
		return 0, 0
	}
	start := 0
	prev := altitude[0]
	for i := 1; i < len(altitude); i++ {
		cur := altitude[i]
		delta := (cur - prev) * sign
		if delta >= elevationDeltaThreshold {
			gain += delta
			duration += time[i] - time[start]
			start = i
			prev = cur
			continue
		}
		if delta > 0 {
			continue // still heading the right way: keep the reference altitude
		}
		start = i
		prev = cur
	}
	return Round(gain, rnd), Round(duration, rnd)
}

func (c *computer) elevationStats(time, distance, altitude []float64) *model.ElevationStats {
	if len(time) == 0 || len(distance) == 0 || len(altitude) == 0 {
		return nil
	}
	ascent, ascentTime := elevationGain(altitude, time, 1)
	descent, _ := elevationGain(altitude, time, -1)
	avg := Mean(altitude)
	q25, q50, q75 := quartiles(altitude)
	e := &model.ElevationStats{
		Avg:         r(avg, 0),
		Max:         r(Max(altitude), rnd),
		Min:         r(Min(altitude), rnd),
		Ascent:      r(ascent, rnd),
		Descent:     r(descent, rnd),
		AscentSpeed: r(ascent/ascentTime*SecHourFactor, rnd),
		LowQ:        r(q25, rnd),
		Median:      r(q50, rnd),
		UpperQ:      r(q75, rnd),
		StdDev:      r(standardDeviation(altitude, avg), rnd),
	}
	if c.withZones {
		e.ElevationZones = c.zones(altitude, time, c.settings.Zones.Elevation)
	}
	return e
}

// zones spreads time across the user's zone boundaries (a value falls in the first zone whose
// upper bound it doesn't exceed) and returns seconds + percent per zone.
func (c *computer) zones(values, time, bounds []float64) []model.Zone {
	if len(bounds) < 2 || len(values) != len(time) {
		return nil
	}
	zones := make([]model.Zone, len(bounds)-1)
	for i := range zones {
		zones[i] = model.Zone{From: bounds[i], To: bounds[i+1]}
	}
	for i := 1; i < len(time); i++ {
		v := values[i]
		for z := range zones {
			if v <= zones[z].To {
				zones[z].S += time[i] - time[i-1]
				break
			}
		}
	}
	total := Last(time)
	for z := range zones {
		zones[z].Percent = n(zones[z].S / total * 100)
	}
	return zones
}

var metSport = map[string]float64{
	model.Ride: 8.5, model.VirtualRide: 8.5, model.Run: 9.8, model.VirtualRun: 9.8, model.Swim: 8.5,
	"Rowing": 7, model.Hike: 6, "Football": 7, "AlpineSki": 7, "Snowboard": 7, "WeightTraining": 3,
	"Climbing": 8, "IceSkate": 10, "InlineSkate": 10, "NordicSki": 10,
}

// EstimateCalories uses power when available, then heart rate (needs age), then MET tables.
func EstimateCalories(sport string, movingTime, weight, age float64, gender model.Gender, avgWatts, avgBpm float64) float64 {
	if !(movingTime > 0) || !(weight > 0) {
		return math.NaN()
	}
	if avgWatts > 0 {
		return Round(movingTime/SecHourFactor*avgWatts*3.6, 1)
	}
	if age > 0 && gender != "" && avgBpm > 0 {
		minutes := movingTime / 60
		if gender == model.Men {
			return Round((-55.0969+0.6309*avgBpm+0.1988*weight+0.2017*age)/4.184*minutes, 1)
		}
		return Round((age*0.074-weight*0.1263+avgBpm*0.4472-20.4022)*minutes/4.184, 1)
	}
	met, ok := metSport[sport]
	if !ok {
		met = 6
	}
	return Round(movingTime*met*3.5*weight/(200*60), 1)
}

// HasAthleteSettingsLacks tells whether a missing threshold (FTP) prevents a stress score.
func HasAthleteSettingsLacks(sport string, stats *model.ActivityStats, s model.AthleteSettings) bool {
	isCycling, isRunning, isSwimming := model.IsRide(sport, false), model.IsRun(sport), model.IsSwim(sport)
	if !isCycling && !isRunning && !isSwimming {
		return false
	}
	if stats.Scores != nil && model.Truthy(stats.Scores.Stress.Trimp) && model.Truthy(stats.Scores.Stress.Hrss) {
		return false
	}
	if isCycling && stats.Power != nil && model.Truthy(stats.Power.Avg) && !model.Truthy(s.CyclingFtp) {
		return true
	}
	if isRunning && stats.Pace != nil && model.Truthy(stats.Pace.GapAvg) && !model.Truthy(s.RunningFtp) {
		return true
	}
	if isSwimming && model.Val(stats.Distance) > 0 && model.Val(stats.MovingTime) > 0 && model.Val(stats.ElapsedTime) > 0 && !model.Truthy(s.SwimFtp) {
		return true
	}
	return false
}
