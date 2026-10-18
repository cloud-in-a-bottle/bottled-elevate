package mapper

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"regexp"
	"time"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/compute"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
)

func sha(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// ActivityID is the id a workout maps to; stable across syncs so re-imports are skipped.
func ActivityID(w *Workout) string {
	source := w.Source
	if source == "" {
		source = "openhost"
	}
	if w.ID != "" {
		return source + ":" + w.ID
	}
	return sha(source + ":" + w.Start + ":" + w.End)
}

var camelSplit = regexp.MustCompile(`([a-z])([A-Z])`)

// DisplaySport turns "WeightTraining" into "Weight Training".
func DisplaySport(sport string) string { return camelSplit.ReplaceAllString(sport, "$1 $2") }

func dayOf(ts string) string {
	if len(ts) >= 10 {
		return ts[:10]
	}
	return ""
}

// Build creates an activity and its raw streams from a full workout detail.
func Build(w *Workout, resolver *compute.SnapshotResolver, settings model.UserSettings, now time.Time) (*model.Activity, *model.Streams) {
	sport := SportOf(w.WorkoutType)
	streams := BuildStreams(w)
	source := w.Source
	if source == "" {
		source = "openhost"
	}
	start, _ := ParseTime(w.Start)
	end, _ := ParseTime(w.End)
	nowISO := now.UTC().Format(time.RFC3339)
	src := w.SourceStats()
	hash, _ := json.Marshal(map[string]any{"type": sport, "startTime": w.Start, "endTime": w.End, "distance": src.Distance})

	a := &model.Activity{
		ID:             ActivityID(w),
		Name:           DisplaySport(sport) + " - " + dayOf(w.Start),
		Type:           sport,
		StartTime:      w.Start,
		EndTime:        w.End,
		StartTimestamp: start.Unix(),
		EndTimestamp:   end.Unix(),
		Hash:           sha(string(hash)),
		CreationTime:   nowISO,
		LastEditTime:   nowISO,
		Device:         source,
		Source:         source,
		ProviderID:     w.ID,
		WorkoutType:    w.WorkoutType,
		SrcStats:       src,
		Trainer:        w.IsIndoor,
	}
	Derive(a, streams, resolver.Resolve(dayOf(w.Start)), settings)
	return a, streams
}

// Derive (re)computes an activity's stats from its raw streams and source stats with the given
// athlete snapshot and settings. It is the single place stats come from, at sync and on recompute.
func Derive(a *model.Activity, raw *model.Streams, snapshot model.AthleteSnapshot, settings model.UserSettings) {
	a.HasStreams = !raw.IsEmpty()
	a.HasMap = raw != nil && len(raw.LatLng) > 0
	a.HasPowerMeter = raw != nil && len(raw.Watts) > 0
	a.IsSwimPool = model.IsSwim(a.Type) && !a.HasMap
	a.AthleteSnapshot = snapshot
	a.LatLngCenter = nil
	if a.HasMap {
		a.LatLngCenter = center(raw.LatLng)
	}

	var stats model.ActivityStats
	if a.HasStreams {
		stats = compute.ComputeStats(compute.ActivityInput{Type: a.Type, HasPowerMeter: a.HasPowerMeter, IsSwimPool: a.IsSwimPool},
			snapshot, settings, raw, true, true)
	}
	applySourceStats(&stats, a.SrcStats)
	if stats.Scores == nil {
		stats.Scores = &model.Scores{}
	}
	if !model.Truthy(stats.Scores.Stress.Trimp) && a.SrcStats != nil {
		applyEstimatedStress(&stats, snapshot, a.Type, model.Val(a.SrcStats.AvgHr), model.Val(stats.MovingTime))
	}
	a.Stats = stats
	a.SettingsLack = compute.HasAthleteSettingsLacks(a.Type, &stats, snapshot.AthleteSettings)
}

func center(ll [][2]float64) []float64 {
	minLat, maxLat, minLon, maxLon := math.Inf(1), math.Inf(-1), math.Inf(1), math.Inf(-1)
	for _, p := range ll {
		minLat, maxLat = math.Min(minLat, p[0]), math.Max(maxLat, p[0])
		minLon, maxLon = math.Min(minLon, p[1]), math.Max(maxLon, p[1])
	}
	return []float64{(minLat + maxLat) / 2, (minLon + maxLon) / 2}
}

// applySourceStats overlays the provider's scalars on the computed stats; provider values win.
func applySourceStats(s *model.ActivityStats, src *model.SourceStats) {
	if src == nil {
		return
	}
	set := func(dst *model.Num, v model.Num) {
		if v != nil {
			*dst = v
		}
	}
	set(&s.Distance, src.Distance)
	set(&s.ElevationGain, src.ElevationGain)
	set(&s.Calories, src.Calories)
	set(&s.CaloriesPerHour, src.CaloriesPerHour)
	if src.ElapsedTime != nil {
		// The provider's duration is the active time; it defines elapsed and moving time.
		s.ElapsedTime, s.MovingTime = src.ElapsedTime, src.MovingTime
		s.PauseTime = model.N(0)
		s.MoveRatio = model.N(1)
	}
	if src.AvgSpeed != nil {
		if s.Speed == nil {
			s.Speed = &model.SpeedStats{}
		}
		s.Speed.Avg = src.AvgSpeed
	}
	if src.AvgPace != nil {
		if s.Pace == nil {
			s.Pace = &model.PaceStats{}
		}
		s.Pace.Avg = src.AvgPace
	}
	if src.AvgHr != nil || src.MaxHr != nil {
		if s.HeartRate == nil {
			s.HeartRate = &model.HeartRateStats{}
		}
		set(&s.HeartRate.Avg, src.AvgHr)
		set(&s.HeartRate.Max, src.MaxHr)
	}
}

// applyEstimatedStress estimates TRIMP/HRSS from average HR for workouts without an HR trace.
func applyEstimatedStress(s *model.ActivityStats, snap model.AthleteSnapshot, sport string, avgHr, durationS float64) {
	as := snap.AthleteSettings
	if math.IsNaN(avgHr) || !(durationS > 0) {
		return
	}
	hrr := compute.HeartRateReserveRatio(avgHr, as.MaxHr, as.RestHr)
	trimp := compute.TrainingImpulse(durationS, hrr*100, snap.Gender)
	if trimp == 0 {
		return
	}
	s.Scores.Stress.Trimp = model.N(trimp)
	s.Scores.Stress.TrimpPerHr = model.N(trimp / durationS * 3600)
	hrss := compute.HeartRateStressScore(snap.Gender, as.MaxHr, as.RestHr, compute.ResolveLTHR(sport, as), trimp)
	if !math.IsNaN(hrss) {
		s.Scores.Stress.Hrss = model.N(hrss)
		s.Scores.Stress.HrssPerHour = model.N(hrss / durationS * 3600)
	}
}
