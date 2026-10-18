package compute

import (
	"math"
	"sort"
)

// MedianFilter removes spikes using a running median over an odd window.
func MedianFilter(array []float64, window int) []float64 {
	if len(array) < window {
		return array
	}
	mid := window / 2
	f := make([]float64, 0, len(array))
	w := []float64{array[0]}
	tmp := make([]float64, 0, window+1)
	for i := 0; i < len(array); i++ {
		if len(array)-1 >= i+mid {
			w = append(w, array[i+mid])
		}
		tmp = append(tmp[:0], w...)
		sort.Float64s(tmp)
		f = append(f, tmp[(len(tmp)-1)/2])
		if i >= mid {
			w = w[1:]
		}
	}
	return f
}

// MeanWindowSmoothing averages each value with the next windowSize-1 values.
func MeanWindowSmoothing(array []float64, windowSize int, roundDecimals int) []float64 {
	factor := math.Pow(10, float64(roundDecimals))
	out := make([]float64, len(array))
	for i := range array {
		end := i + windowSize
		if end > len(array) {
			end = len(array)
		}
		m := Mean(array[i:end])
		out[i] = math.Floor(m*factor+0.5) / factor
	}
	return out
}

// LowPassSmooth is an exponential smoothing pass (Elevate's LowPassFilter.smoothArray).
func LowPassSmooth(values []float64, smoothing float64) []float64 {
	out := append([]float64(nil), values...)
	var value float64
	found := false
	for _, v := range out {
		if finite(v) {
			value, found = v, true
			break
		}
	}
	if !found || value == 0 {
		return out
	}
	for i := 1; i < len(out); i++ {
		value += (out[i] - value) * smoothing
		out[i] = math.Floor(value*100+0.5) / 100
	}
	return out
}

// KalmanApply runs a 1D Kalman filter (A=1, B=0, C=1) over the series, rounded to 3 decimals.
func KalmanApply(array []float64, r, q float64) []float64 {
	out := make([]float64, len(array))
	x, cov := math.NaN(), math.NaN()
	for i, z := range array {
		if math.IsNaN(x) {
			x = z
			cov = q
		} else {
			predCov := cov + r
			k := predCov / (predCov + q)
			x = x + k*(z-x)
			cov = predCov - k*predCov
		}
		out[i] = math.Floor(x*1000+0.5) / 1000
	}
	return out
}
