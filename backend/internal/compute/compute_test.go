package compute

import (
	"math"
	"math/rand"
	"testing"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
)

func TestLowPassSmooth(t *testing.T) {
	values := []float64{10, 8, 9, 10, 12, 8, 50, 10, 12, 8}
	got := LowPassSmooth(values, 0.5)
	want := []float64{10, 9, 9, 9.5, 10.75, 9.38, 29.69, 19.85, 15.93, 11.96}
	for i := range want {
		if math.Abs(got[i]-want[i]) > 0.011 {
			t.Fatalf("LowPassSmooth[%d] = %v, want %v (all %v)", i, got[i], want[i], got)
		}
	}
	if values[1] != 8 {
		t.Fatal("LowPassSmooth must not modify its input")
	}
}

func TestMedianFilterRemovesSpikes(t *testing.T) {
	got := MedianFilter([]float64{10, 10, 90, 10, 10}, 3)
	for i, v := range got {
		if v != 10 {
			t.Fatalf("MedianFilter[%d] = %v, want 10 (%v)", i, v, got)
		}
	}
}

// naiveBestSplit is Elevate's original SplitCalculator: re-average every window.
func naiveBestSplit(scale, data []float64, target float64) (float64, bool) {
	if target > scale[len(scale)-1] {
		return 0, false
	}
	best := math.Inf(-1)
	ws := 0
	for cur := 0; cur < len(scale); {
		if scale[cur]-scale[ws] < target {
			cur++
			continue
		}
		if ws <= cur { // JS slices an inverted range to [] whose mean is NaN
			if m := Mean(data[ws : cur+1]); m > best {
				best = m
			}
		}
		ws++
	}
	return Round(best, 3), true
}

func TestBestSplitMatchesNaive(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	for trial := 0; trial < 200; trial++ {
		n := 2 + rng.Intn(300)
		scale := make([]float64, n)
		data := make([]float64, n)
		for i := range scale {
			if i > 0 {
				scale[i] = scale[i-1] + float64(1+rng.Intn(5))
			}
			data[i] = rng.Float64() * 300
		}
		target := float64(1 + rng.Intn(int(scale[n-1])+5)) // the original never returns for a 0 range
		want, wantOK := naiveBestSplit(scale, data, target)
		got, s, e, ok := BestSplit(scale, data, target)
		if ok != wantOK || (ok && math.Abs(got-want) > 1e-9) {
			t.Fatalf("trial %d: BestSplit=%v,%v want %v,%v", trial, got, ok, want, wantOK)
		}
		if ok && scale[e]-scale[s] < target {
			t.Fatalf("trial %d: window [%d,%d] shorter than %v", trial, s, e, target)
		}
	}
}

func TestTimePeaksOnlyRangesWithinActivity(t *testing.T) {
	time := make([]float64, 400)
	hr := make([]float64, 400)
	for i := range time {
		time[i] = float64(i)
		hr[i] = 120
	}
	hr[200] = 180
	peaks := TimePeaks(time, hr)
	if len(peaks) != 9 { // 1s .. 5min
		t.Fatalf("got %d peaks, want 9", len(peaks))
	}
	// A 1s window spans two samples, so the spike averages with its neighbour.
	if *peaks[0].Result != 150 || peaks[0].Start != 199 || peaks[0].End != 200 {
		t.Fatalf("1s peak = %+v (%v), want 150 over [199,200]", peaks[0], *peaks[0].Result)
	}
}

func TestStressScores(t *testing.T) {
	// One hour at lactate threshold scores 100 HRSS, by definition.
	maxHr, restHr, lthr := 190.0, 60.0, 170.0
	hrr := HeartRateReserveRatio(lthr, maxHr, restHr) * 100
	trimp := TrainingImpulse(3600, hrr, model.Men)
	if got := HeartRateStressScore(model.Men, maxHr, restHr, lthr, trimp); math.Abs(got-100) > 1e-9 {
		t.Fatalf("HRSS at threshold for 1h = %v, want 100", got)
	}
	if got := PowerStressScore(3600, 250, 250); math.Abs(got-100) > 1e-9 {
		t.Fatalf("PSS at FTP for 1h = %v, want 100", got)
	}
	if got := RunningStressScore(3600, 240, 240); math.Abs(got-100) > 1e-9 {
		t.Fatalf("RSS at threshold pace for 1h = %v, want 100", got)
	}
}

func TestResolveLTHR(t *testing.T) {
	cycling := 165.0
	s := model.AthleteSettings{MaxHr: 190, RestHr: 60, Lthr: model.LactateThreshold{Cycling: &cycling}}
	if got := ResolveLTHR(model.Ride, s); got != 165 {
		t.Fatalf("ride LTHR = %v, want the cycling threshold", got)
	}
	if got := ResolveLTHR(model.Run, s); got != 60+0.85*130 {
		t.Fatalf("run LTHR = %v, want the Karvonen estimate", got)
	}
}

func TestComputeStatsRide(t *testing.T) {
	n := 3601
	s := &model.Streams{}
	for i := 0; i < n; i++ {
		s.Time = append(s.Time, float64(i))
		s.Distance = append(s.Distance, float64(i)*8)
		s.VelocitySmooth = append(s.VelocitySmooth, 8)
		s.Altitude = append(s.Altitude, 100+50*math.Sin(float64(i)/300))
		s.Heartrate = append(s.Heartrate, 150)
		s.Watts = append(s.Watts, 200)
		s.Cadence = append(s.Cadence, 90)
	}
	ftp := 250.0
	snap := model.AthleteSnapshot{Gender: model.Men, AthleteSettings: model.AthleteSettings{MaxHr: 190, RestHr: 60, Weight: 70, CyclingFtp: &ftp}}
	st := ComputeStats(ActivityInput{Type: model.Ride, HasPowerMeter: true}, snap, model.DefaultUserSettings(), s, true, true)

	if *st.Distance != 28800 || *st.ElapsedTime != 3600 {
		t.Fatalf("distance/elapsed = %v/%v", *st.Distance, *st.ElapsedTime)
	}
	if math.Abs(*st.Speed.Avg-28.8) > 0.01 {
		t.Fatalf("avg speed = %v, want 28.8 kph", *st.Speed.Avg)
	}
	if *st.Power.Avg != 200 || math.Abs(*st.Power.Weighted-200) > 0.01 {
		t.Fatalf("power avg/np = %v/%v", *st.Power.Avg, *st.Power.Weighted)
	}
	if math.Abs(*st.Scores.Stress.Pss-64) > 0.1 { // IF 0.8 for 1h
		t.Fatalf("PSS = %v, want 64", *st.Scores.Stress.Pss)
	}
	if *st.HeartRate.Avg != 150 || st.Scores.Stress.Hrss == nil {
		t.Fatalf("hr avg %v hrss %v", *st.HeartRate.Avg, st.Scores.Stress.Hrss)
	}
	if st.Elevation == nil || *st.Elevation.Ascent < 150 {
		t.Fatalf("elevation = %+v", st.Elevation)
	}
	total := 0.0
	for _, z := range st.HeartRate.Zones {
		total += z.S
	}
	if total != 3600 {
		t.Fatalf("HR zones cover %vs, want 3600", total)
	}
	if len(st.Power.Peaks) != 13 {
		t.Fatalf("got %d power peaks", len(st.Power.Peaks))
	}
}

func TestSnapshotResolverPicksPeriod(t *testing.T) {
	since := "2026-03-01"
	a := model.Athlete{Gender: model.Women, DatedAthleteSettings: []model.DatedAthleteSettings{
		{Since: nil, AthleteSettings: model.AthleteSettings{MaxHr: 190, RestHr: 60, Weight: 60}},
		{Since: &since, AthleteSettings: model.AthleteSettings{MaxHr: 185, RestHr: 55, Weight: 58}},
	}}
	birth := "1990-06-15"
	a.BirthDate = &birth
	r := NewSnapshotResolver(a)
	if got := r.Resolve("2026-02-28").AthleteSettings.Weight; got != 60 {
		t.Fatalf("before period weight = %v", got)
	}
	snap := r.Resolve("2026-03-01")
	if snap.AthleteSettings.Weight != 58 || snap.Gender != model.Women || *snap.Age != 35 {
		t.Fatalf("snapshot = %+v age %v", snap, *snap.Age)
	}
}

func TestBuildLaps(t *testing.T) {
	s := &model.Streams{}
	for i := 0; i <= 2500; i++ {
		s.Time = append(s.Time, float64(i))
		s.Distance = append(s.Distance, float64(i))
		s.VelocitySmooth = append(s.VelocitySmooth, 1)
	}
	laps := BuildLaps(s, model.Metric)
	if len(laps) != 3 || *laps[0].Distance != 1000 || *laps[2].Distance != 500 {
		t.Fatalf("laps = %+v", laps)
	}
	if mi := BuildLaps(s, model.Imperial); len(mi) != 2 {
		t.Fatalf("imperial laps = %d", len(mi))
	}
}
