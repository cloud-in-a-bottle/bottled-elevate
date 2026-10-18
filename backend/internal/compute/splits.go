package compute

import (
	"math"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
)

// BestSplit finds the window spanning at least targetRange (in scale units, eg seconds or meters)
// with the highest average of data. ok is false when the range exceeds the whole scale.
//
// Same result as Elevate's SplitCalculator, but uses a prefix sum and a two-pointer sweep instead
// of re-averaging a slice per window, so it stays linear on long activities.
func BestSplit(scale, data []float64, targetRange float64) (value float64, start, end int, ok bool) {
	n := len(scale)
	if len(data) < n {
		n = len(data)
	}
	if n == 0 || targetRange > scale[len(scale)-1] {
		return 0, 0, 0, false
	}
	prefix := make([]float64, n+1)
	for i := 0; i < n; i++ {
		prefix[i+1] = prefix[i] + data[i]
	}
	best := math.Inf(-1)
	cur := 0
	for ws := 0; ws < n; ws++ {
		if cur < ws {
			cur = ws
		}
		for cur < n && scale[cur]-scale[ws] < targetRange {
			cur++
		}
		if cur >= n {
			break
		}
		avg := (prefix[cur+1] - prefix[ws]) / float64(cur-ws+1)
		// Prefix differences carry float noise; demand a real improvement so ties keep the
		// earliest window, as the original strict comparison over exact window means did.
		if math.IsInf(best, -1) || avg > best+1e-9*math.Max(1, math.Abs(best)) {
			best, start, end = avg, ws, cur
		}
	}
	if math.IsInf(best, -1) {
		return math.NaN(), start, end, true
	}
	// Report the exact mean of the winning window (sequential sum, like _.mean).
	return Round(Mean(data[start:end+1]), 3), start, end, true
}

var peakRanges = []float64{1, 2, 5, 10, 20, 30, 60, 2 * 60, 5 * 60, 10 * 60, 20 * 60, 30 * 60, 60 * 60}

// TimePeaks computes the best averages of data over the standard time ranges (up to 1h).
func TimePeaks(time, data []float64) []model.Peak {
	if len(time) == 0 {
		return nil
	}
	maxTime := math.Min(Last(time), peakRanges[len(peakRanges)-1])
	peaks := []model.Peak{}
	for _, r := range peakRanges {
		if r > maxTime {
			continue
		}
		v, s, e, ok := BestSplit(time, data, r)
		if !ok {
			continue
		}
		peaks = append(peaks, model.Peak{Range: r, Result: model.N(v), Start: s, End: e})
	}
	return peaks
}

// timeSplit is the best average over rangeSeconds, NaN when the activity is shorter.
func timeSplit(values, time []float64, rangeSeconds float64) float64 {
	v, _, _, ok := BestSplit(time, values, rangeSeconds)
	if !ok {
		return math.NaN()
	}
	return Round(v, rnd)
}
