package compute

import (
	"math"
	"sort"
)

// Round rounds half up like lodash's _.round (JS Math.round semantics). NaN/Inf pass through.
func Round(v float64, precision int) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return v
	}
	p := math.Pow(10, float64(precision))
	return math.Floor(v*p+0.5) / p
}

// Mean is NaN for an empty slice, like _.mean.
func Mean(a []float64) float64 {
	if len(a) == 0 {
		return math.NaN()
	}
	return Sum(a) / float64(len(a))
}

func Sum(a []float64) float64 {
	s := 0.0
	for _, v := range a {
		s += v
	}
	return s
}

// Max is NaN for an empty slice (lodash returns undefined).
func Max(a []float64) float64 {
	if len(a) == 0 {
		return math.NaN()
	}
	m := a[0]
	for _, v := range a[1:] {
		if v > m {
			m = v
		}
	}
	return m
}

func Min(a []float64) float64 {
	if len(a) == 0 {
		return math.NaN()
	}
	m := a[0]
	for _, v := range a[1:] {
		if v < m {
			m = v
		}
	}
	return m
}

func Last(a []float64) float64 {
	if len(a) == 0 {
		return math.NaN()
	}
	return a[len(a)-1]
}

func Clamp(v, lo, hi float64) float64 {
	return math.Max(lo, math.Min(hi, v))
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

// percentile of an ascending-sorted slice (Elevate's definition).
func percentile(sorted []float64, p float64) float64 {
	n := len(sorted)
	if n == 0 {
		return math.NaN()
	}
	index := p * float64(n)
	if math.Floor(index) == index {
		i := int(index)
		if i <= 0 || i >= n {
			return math.NaN()
		}
		return (sorted[i-1] + sorted[i]) / 2
	}
	return sorted[int(math.Floor(index))]
}

func quartiles(data []float64) (float64, float64, float64) {
	s := append([]float64(nil), data...)
	sort.Float64s(s)
	return percentile(s, 0.25), percentile(s, 0.5), percentile(s, 0.75)
}

func standardDeviation(stream []float64, avg float64) float64 {
	sq := make([]float64, len(stream))
	for i, v := range stream {
		sq[i] = v * v
	}
	variance := Mean(sq) - avg*avg
	if variance > 0 {
		return math.Sqrt(variance)
	}
	return 0
}

const (
	MpsKphFactor     = 3.6
	SecHourFactor    = 3600.0
	KmToMileFactor   = 0.621371
	MeterToFeetFactr = 3.28084
)

// SpeedToPace converts kph to s/km.
func SpeedToPace(kph float64) float64 {
	if finite(kph) && kph > 0 {
		return SecHourFactor / kph
	}
	return math.NaN()
}

func PaceToSpeed(pace float64) float64 {
	if finite(pace) && pace > 0 {
		return SecHourFactor / pace
	}
	return math.NaN()
}

// SpeedToSwimPace converts kph to s/100m.
func SpeedToSwimPace(kph float64) float64 {
	mps := kph / MpsKphFactor
	if mps > 0 {
		return 100 / mps
	}
	return math.NaN()
}
