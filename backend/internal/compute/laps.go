package compute

import (
	"math"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
)

// BuildLaps splits an activity into per-distance laps (1 km metric, 1 mi imperial). Providers
// like Apple Health carry no lap markers, so these are derived from the distance stream.
func BuildLaps(s *model.Streams, system model.MeasureSystem) []model.Lap {
	if s == nil || len(s.Distance) == 0 || len(s.Distance) != len(s.Time) || Last(s.Distance) <= 0 {
		return nil
	}
	lapMeters := 1000.0
	if system == model.Imperial {
		lapMeters = 1609.344
	}
	var laps []model.Lap
	start, id := 0, 1
	boundary := lapMeters
	for i := 1; i < len(s.Distance); i++ {
		if s.Distance[i] >= boundary {
			laps = append(laps, makeLap(s, start, i, id))
			id++
			start = i
			boundary = s.Distance[i] + lapMeters
		}
	}
	if len(s.Distance)-1 > start {
		laps = append(laps, makeLap(s, start, len(s.Distance)-1, id))
	}
	return laps
}

func sliceFinite(a []float64, from, to int) []float64 {
	if len(a) == 0 {
		return nil
	}
	if to >= len(a) {
		to = len(a) - 1
	}
	var out []float64
	for i := from; i <= to; i++ {
		if finite(a[i]) {
			out = append(out, a[i])
		}
	}
	return out
}

func makeLap(s *model.Streams, a, b, id int) model.Lap {
	distance := s.Distance[b] - s.Distance[a]
	elapsed := s.Time[b] - s.Time[a]
	lap := model.Lap{
		ID: id, Active: true, Indexes: [2]int{a, b},
		Distance: model.N(math.Round(distance)), ElapsedTime: model.N(elapsed), MovingTime: model.N(elapsed),
	}
	speeds := sliceFinite(s.VelocitySmooth, a, b)
	avgKph := math.NaN()
	if len(speeds) > 0 {
		avgKph = Mean(speeds) * MpsKphFactor
	} else if elapsed > 0 {
		avgKph = distance / elapsed * MpsKphFactor
	}
	if finite(avgKph) {
		lap.AvgSpeed = model.N(Round(avgKph, 2))
		lap.AvgPace = model.N(SpeedToPace(avgKph))
	}
	if len(speeds) > 0 {
		lap.MaxSpeed = model.N(Round(Max(speeds)*MpsKphFactor, 2))
	}
	if hr := sliceFinite(s.Heartrate, a, b); len(hr) > 0 {
		lap.AvgHr = model.N(math.Round(Mean(hr)))
		lap.MaxHr = model.N(Max(hr))
	}
	if w := sliceFinite(s.Watts, a, b); len(w) > 0 {
		lap.AvgWatts = model.N(math.Round(Mean(w)))
	}
	if cad := sliceFinite(s.Cadence, a, b); len(cad) > 0 {
		lap.AvgCadence = model.N(math.Round(Mean(cad)))
	}
	if len(s.Altitude) > b {
		gain := 0.0
		for i := a + 1; i <= b; i++ {
			if d := s.Altitude[i] - s.Altitude[i-1]; d > 0 {
				gain += d
			}
		}
		lap.ElevationGain = model.N(math.Round(gain))
	}
	return lap
}
