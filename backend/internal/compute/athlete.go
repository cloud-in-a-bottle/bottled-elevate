package compute

import (
	"sort"
	"time"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
)

// SnapshotResolver picks the athlete settings that were in effect on a given day.
type SnapshotResolver struct {
	athlete model.Athlete
}

func NewSnapshotResolver(a model.Athlete) *SnapshotResolver {
	if len(a.DatedAthleteSettings) == 0 {
		a.DatedAthleteSettings = model.DefaultAthlete().DatedAthleteSettings
	}
	sorted := append([]model.DatedAthleteSettings(nil), a.DatedAthleteSettings...)
	// Most recent period first; the "forever" period (nil since) sorts last.
	sort.SliceStable(sorted, func(i, j int) bool { return sinceKey(sorted[i]) > sinceKey(sorted[j]) })
	a.DatedAthleteSettings = sorted
	return &SnapshotResolver{athlete: a}
}

func sinceKey(d model.DatedAthleteSettings) string {
	if d.Since == nil {
		return ""
	}
	return *d.Since
}

// Resolve returns the snapshot for a YYYY-MM-DD day.
func (r *SnapshotResolver) Resolve(day string) model.AthleteSnapshot {
	settings := model.DefaultAthleteSettings()
	for _, d := range r.athlete.DatedAthleteSettings {
		if d.Since == nil || *d.Since <= day {
			settings = d.AthleteSettings
			break
		}
	}
	snap := model.AthleteSnapshot{Gender: r.athlete.Gender, AthleteSettings: settings}
	if r.athlete.Gender == "" {
		snap.Gender = model.Men
	}
	if r.athlete.BirthDate != nil {
		if age, ok := ageAt(*r.athlete.BirthDate, day); ok {
			snap.Age = model.N(float64(age))
		}
	}
	return snap
}

func ageAt(birthDate, day string) (int, bool) {
	if len(birthDate) < 10 || len(day) < 10 {
		return 0, false
	}
	b, err1 := time.Parse("2006-01-02", birthDate[:10])
	d, err2 := time.Parse("2006-01-02", day[:10])
	if err1 != nil || err2 != nil {
		return 0, false
	}
	age := d.Year() - b.Year()
	if d.YearDay() < b.YearDay() {
		age--
	}
	return age, true
}
