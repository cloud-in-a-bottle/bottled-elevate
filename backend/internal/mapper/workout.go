// Package mapper turns health-data-service workouts into Elevate activities and streams.
package mapper

import (
	"encoding/xml"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
)

// Wire shapes of github.com/imbue-openhost/health-data-service-spec. The list endpoint returns
// scalar summaries only; the per-workout detail endpoint adds the traces and route.

type Scalar struct {
	Value *float64 `json:"value"`
}

type Sample struct {
	Timestamp string   `json:"timestamp"`
	Value     *float64 `json:"value"`
}

type TimeSeries struct {
	Samples []Sample `json:"samples"`
}

type Workout struct {
	ID          string `json:"id"`
	WorkoutType string `json:"workout_type"`
	Start       string `json:"start"`
	End         string `json:"end"`
	Source      string `json:"source"`
	IsIndoor    bool   `json:"is_indoor"`

	Duration         *Scalar `json:"duration"` // minutes
	Calories         *Scalar `json:"calories"`
	AverageHeartRate *Scalar `json:"average_heart_rate"`
	MaxHeartRate     *Scalar `json:"max_heart_rate"`
	Distance         *Scalar `json:"distance"`      // meters
	AverageSpeed     *Scalar `json:"average_speed"` // m/s
	ElevationGain    *Scalar `json:"elevation_gain"`
	AveragePace      *Scalar `json:"average_pace"` // s/km
	AveragePower     *Scalar `json:"average_power"`
	MaxPower         *Scalar `json:"max_power"`
	AverageCadence   *Scalar `json:"average_cadence"`

	HeartRate *TimeSeries `json:"heart_rate"`
	Power     *TimeSeries `json:"power"`
	Cadence   *TimeSeries `json:"cadence"`
	RouteGPX  string      `json:"route_gpx"`
}

func scalar(s *Scalar) float64 {
	if s == nil || s.Value == nil || math.IsNaN(*s.Value) || math.IsInf(*s.Value, 0) {
		return math.NaN()
	}
	return *s.Value
}

func ParseTime(s string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05", "2006-01-02T15:04:05.999999"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// workoutTypeOverrides map workout_type slugs whose sport differs from a plain PascalCase of the
// slug. Slugs that PascalCase onto a known sport (yoga, rowing, tennis…) need no entry.
var workoutTypeOverrides = map[string]string{
	"running":         model.Run,
	"cycling":         model.Ride,
	"swimming":        model.Swim,
	"walking":         model.Walk,
	"hiking":          model.Hike,
	"strength":        "WeightTraining",
	"snowboarding":    "Snowboard",
	"downhill_skiing": "AlpineSki",
	"stair_climbing":  "StairStepper",
	"cardio_dance":    "Dance",
	"core_training":   "WeightTraining",
	"other":           model.Other,
}

func pascalCase(slug string) string {
	parts := strings.FieldsFunc(slug, func(r rune) bool { return r == '_' || r == ' ' })
	for i, p := range parts {
		parts[i] = strings.ToUpper(p[:1]) + strings.ToLower(p[1:])
	}
	return strings.Join(parts, "")
}

func SportOf(workoutType string) string {
	key := strings.ToLower(workoutType)
	if s, ok := workoutTypeOverrides[key]; ok {
		return s
	}
	if c := pascalCase(key); model.IsSport(c) {
		return c
	}
	return model.Other
}

// DurationSeconds prefers the provider's duration (active time) over end - start.
func (w *Workout) DurationSeconds() float64 {
	if m := scalar(w.Duration); !math.IsNaN(m) {
		return m * 60
	}
	start, ok1 := ParseTime(w.Start)
	end, ok2 := ParseTime(w.End)
	if !ok1 || !ok2 {
		return 0
	}
	return math.Max(0, math.Floor(end.Sub(start).Seconds()))
}

// SourceStats are the provider's own scalar summaries.
func (w *Workout) SourceStats() *model.SourceStats {
	d := w.DurationSeconds()
	src := &model.SourceStats{ElapsedTime: model.N(d), MovingTime: model.N(d)}
	distance := scalar(w.Distance)
	src.Distance = model.N(distance)
	src.ElevationGain = model.N(scalar(w.ElevationGain))
	if cal := scalar(w.Calories); !math.IsNaN(cal) {
		src.Calories = model.N(cal)
		if d > 0 {
			src.CaloriesPerHour = model.N(cal / d * 3600)
		}
	}
	speedKph := scalar(w.AverageSpeed) * 3.6
	if math.IsNaN(speedKph) && !math.IsNaN(distance) && d > 0 {
		speedKph = distance / d * 3.6
	}
	src.AvgSpeed = model.N(speedKph)
	pace := scalar(w.AveragePace)
	if math.IsNaN(pace) && speedKph > 0 {
		pace = 3600 / speedKph
	}
	src.AvgPace = model.N(pace)
	src.AvgHr = model.N(scalar(w.AverageHeartRate))
	src.MaxHr = model.N(scalar(w.MaxHeartRate))
	return src
}

type timed struct {
	t float64 // epoch seconds
	v float64
}

func parseSamples(ts *TimeSeries) []timed {
	if ts == nil {
		return nil
	}
	out := make([]timed, 0, len(ts.Samples))
	for _, s := range ts.Samples {
		t, ok := ParseTime(s.Timestamp)
		if !ok || s.Value == nil || math.IsNaN(*s.Value) || math.IsInf(*s.Value, 0) {
			continue
		}
		out = append(out, timed{t: float64(t.UnixMilli()) / 1000, v: *s.Value})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].t < out[j].t })
	return out
}

// interpolate linearly interpolates samples at t (epoch seconds), clamping at the ends. The
// cursor makes a monotonic sweep linear overall.
type interpolator struct {
	s []timed
	i int
}

func (it *interpolator) at(t float64) float64 {
	s := it.s
	if t <= s[0].t {
		return s[0].v
	}
	if t >= s[len(s)-1].t {
		return s[len(s)-1].v
	}
	if it.i < 1 || s[it.i-1].t > t {
		it.i = 1
	}
	for it.i < len(s) && s[it.i].t < t {
		it.i++
	}
	a, b := s[it.i-1], s[it.i]
	frac := 0.0
	if span := b.t - a.t; span > 0 {
		frac = (t - a.t) / span
	}
	return math.Round(a.v + (b.v-a.v)*frac)
}

type gpxPoint struct {
	t        float64 // epoch seconds; NaN when missing
	lat, lon float64
	ele      float64 // NaN when missing
}

type gpxDoc struct {
	Trk []struct {
		Seg []struct {
			Pts []struct {
				Lat  string `xml:"lat,attr"`
				Lon  string `xml:"lon,attr"`
				Ele  string `xml:"ele"`
				Time string `xml:"time"`
			} `xml:"trkpt"`
		} `xml:"trkseg"`
	} `xml:"trk"`
}

func parseFloat(s string) float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return math.NaN()
	}
	return f
}

func parseGPX(doc string) []gpxPoint {
	var g gpxDoc
	if err := xml.Unmarshal([]byte(doc), &g); err != nil {
		return nil
	}
	var pts []gpxPoint
	for _, trk := range g.Trk {
		for _, seg := range trk.Seg {
			for _, p := range seg.Pts {
				lat, lon := parseFloat(p.Lat), parseFloat(p.Lon)
				if math.IsNaN(lat) || math.IsNaN(lon) {
					continue
				}
				pt := gpxPoint{lat: lat, lon: lon, ele: math.NaN(), t: math.NaN()}
				if p.Ele != "" {
					pt.ele = parseFloat(p.Ele)
				}
				if t, ok := ParseTime(strings.TrimSpace(p.Time)); ok {
					pt.t = float64(t.UnixMilli()) / 1000
				}
				pts = append(pts, pt)
			}
		}
	}
	return pts
}

func haversine(aLat, aLon, bLat, bLon float64) float64 {
	const R = 6371000.0
	rad := math.Pi / 180
	dLat := (bLat - aLat) * rad
	dLon := (bLon - aLon) * rad
	h := math.Pow(math.Sin(dLat/2), 2) + math.Cos(aLat*rad)*math.Cos(bLat*rad)*math.Pow(math.Sin(dLon/2), 2)
	return 2 * R * math.Asin(math.Min(1, math.Sqrt(h)))
}

func round(v float64, p int) float64 {
	f := math.Pow(10, float64(p))
	return math.Round(v*f) / f
}

// BuildStreams builds raw streams from the workout's traces and route. With a route the
// trackpoints form the timeline and each trace is interpolated onto it; otherwise the densest
// trace forms the timeline. Returns nil when there is nothing usable.
func BuildStreams(w *Workout) *model.Streams {
	hr, power, cadence := parseSamples(w.HeartRate), parseSamples(w.Power), parseSamples(w.Cadence)
	var route []gpxPoint
	if w.RouteGPX != "" {
		route = parseGPX(w.RouteGPX)
	}
	if len(route) >= 2 && !w.IsIndoor {
		return streamsFromRoute(route, hr, power, cadence, w.DurationSeconds())
	}
	var base []timed
	for _, s := range [][]timed{hr, power, cadence} {
		if len(s) >= 2 && len(s) > len(base) {
			base = s
		}
	}
	if base == nil {
		return nil
	}
	s := &model.Streams{Time: make([]float64, len(base))}
	t0 := base[0].t
	for i, b := range base {
		s.Time[i] = math.Round(b.t - t0)
	}
	s.Heartrate = sampleOnto(hr, base)
	s.Watts = sampleOnto(power, base)
	s.Cadence = sampleOnto(cadence, base)
	return s
}

func sampleOnto(samples, base []timed) []float64 {
	if len(samples) == 0 {
		return nil
	}
	it := &interpolator{s: samples}
	out := make([]float64, len(base))
	for i, b := range base {
		out[i] = it.at(b.t)
	}
	return out
}

func streamsFromRoute(pts []gpxPoint, hr, power, cadence []timed, durationS float64) *model.Streams {
	n := len(pts)
	s := &model.Streams{
		Time: make([]float64, n), LatLng: make([][2]float64, n), Distance: make([]float64, n), VelocitySmooth: make([]float64, n),
	}
	hasEle := false
	for _, p := range pts {
		if !math.IsNaN(p.ele) {
			hasEle = true
			break
		}
	}
	if hasEle {
		s.Altitude = make([]float64, n)
		s.GradeSmooth = make([]float64, n)
	}
	var hrIt, pwIt, cadIt *interpolator
	if len(hr) > 0 {
		s.Heartrate, hrIt = make([]float64, n), &interpolator{s: hr}
	}
	if len(power) > 0 {
		s.Watts, pwIt = make([]float64, n), &interpolator{s: power}
	}
	if len(cadence) > 0 {
		s.Cadence, cadIt = make([]float64, n), &interpolator{s: cadence}
	}
	t0 := pts[0].t
	cum := 0.0
	for i, p := range pts {
		var t float64
		if !math.IsNaN(p.t) && !math.IsNaN(t0) {
			t = math.Round(p.t - t0)
		} else {
			t = math.Round(float64(i) / float64(n-1) * durationS)
		}
		s.Time[i] = t
		s.LatLng[i] = [2]float64{p.lat, p.lon}
		if i > 0 {
			cum += haversine(pts[i-1].lat, pts[i-1].lon, p.lat, p.lon)
		}
		s.Distance[i] = round(cum, 1)
		dt, dd := 0.0, 0.0
		if i > 0 {
			dt = s.Time[i] - s.Time[i-1]
			dd = s.Distance[i] - s.Distance[i-1]
		}
		if dt > 0 {
			s.VelocitySmooth[i] = round(dd/dt, 2)
		}
		if hasEle {
			ele := p.ele
			if math.IsNaN(ele) {
				ele = 0
				if i > 0 {
					ele = s.Altitude[i-1]
				}
			}
			s.Altitude[i] = round(ele, 1)
			if i > 0 && dd > 0 {
				de := s.Altitude[i] - s.Altitude[i-1]
				s.GradeSmooth[i] = round(math.Max(-45, math.Min(45, de/dd*100)), 1)
			}
		}
		at := p.t
		if math.IsNaN(at) {
			base := t0
			if math.IsNaN(base) {
				base = 0
			}
			at = base + t
		}
		if hrIt != nil {
			s.Heartrate[i] = hrIt.at(at)
		}
		if pwIt != nil {
			s.Watts[i] = pwIt.at(at)
		}
		if cadIt != nil {
			s.Cadence[i] = cadIt.at(at)
		}
	}
	return s
}
