// Package devdata generates synthetic health-data workouts (runs and rides with GPS, HR, power and
// cadence; pool swims; HR-only and summary-only workouts) for local development and tests.
package devdata

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"sort"
	"strings"
	"time"
)

const centerLat, centerLon = 37.7694, -122.4862

type scalar struct {
	Value float64 `json:"value"`
}

type sample struct {
	Timestamp string  `json:"timestamp"`
	Value     float64 `json:"value"`
}

type series struct {
	Samples []sample `json:"samples"`
}

// Workout is one synthetic workout as the list (summary) and detail endpoints serve it.
type Workout struct {
	summary map[string]any
	detail  map[string]any
}

func ts(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func routeGPX(rng *rand.Rand, start time.Time, durationS int, n int, radiusM, phase, hills float64) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="devhealth" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>dev</name><trkseg>`)
	for i := 0; i < n; i++ {
		frac := float64(i) / float64(n-1)
		ang := 2*math.Pi*frac + phase
		r := radiusM * (1 + 0.15*math.Sin(3*ang+phase))
		lat := centerLat + r*math.Cos(ang)/111320
		lon := centerLon + r*math.Sin(ang)/(111320*math.Cos(centerLat*math.Pi/180))
		ele := 25 + hills*math.Sin(2*ang+phase) + hills/3*math.Sin(5*ang) + rng.Float64()*0.6
		t := start.Add(time.Duration(frac*float64(durationS)) * time.Second)
		fmt.Fprintf(&b, `<trkpt lat="%.6f" lon="%.6f"><ele>%.1f</ele><time>%s</time></trkpt>`, lat, lon, ele, ts(t))
	}
	b.WriteString(`</trkseg></trk></gpx>`)
	return b.String()
}

func samples(rng *rand.Rand, start time.Time, durationS, period int, base, amp, freq, phase float64) series {
	var out []sample
	for s := 0; s <= durationS; s += period {
		v := base + amp*math.Sin(2*math.Pi*freq*float64(s)/float64(durationS)+phase) + 4*math.Sin(float64(s)/47) + rng.NormFloat64()*2
		out = append(out, sample{Timestamp: ts(start.Add(time.Duration(s) * time.Second)), Value: math.Round(math.Max(0, v))})
	}
	return series{Samples: out}
}

// Build generates synthetic workouts over the months before `end`.
func Build(end time.Time, months int) map[string]Workout {
	rng := rand.New(rand.NewSource(42))
	out := map[string]Workout{}
	day := end.AddDate(0, -months, 0)
	n := 0
	add := func(id, wtype string, start time.Time, durS int, sum map[string]any, det map[string]any) {
		s := map[string]any{
			"id": id, "workout_type": wtype, "start": ts(start), "end": ts(start.Add(time.Duration(durS) * time.Second)),
			"source": "dev-health", "duration": scalar{float64(durS) / 60},
		}
		for k, v := range sum {
			s[k] = v
		}
		d := map[string]any{}
		for k, v := range s {
			d[k] = v
		}
		for k, v := range det {
			d[k] = v
		}
		out[id] = Workout{summary: s, detail: d}
	}
	for ; day.Before(end); day = day.AddDate(0, 0, 1) {
		// Training builds through the season: more and longer sessions in spring/summer.
		season := 0.5 + 0.5*math.Sin(2*math.Pi*(float64(day.YearDay())-80)/365)
		if rng.Float64() > 0.45+0.35*season {
			continue
		}
		n++
		start := day.Add(time.Duration(7+rng.Intn(12))*time.Hour + time.Duration(rng.Intn(60))*time.Minute)
		id := fmt.Sprintf("w%04d", n)
		phase := rng.Float64() * 2
		switch kind := rng.Float64(); {
		case kind < 0.42: // run
			dur := int((30 + rng.Float64()*40*(0.6+season)) * 60)
			speed := 2.7 + rng.Float64()*0.8
			dist := speed * float64(dur)
			radius := dist / (2 * math.Pi * 1.03)
			avgHr := 140 + rng.Float64()*25
			add(id, "running", start, dur, map[string]any{
				"distance": scalar{math.Round(dist)}, "average_speed": scalar{speed}, "calories": scalar{math.Round(float64(dur) / 60 * 11)},
				"elevation_gain": scalar{math.Round(30 + rng.Float64()*120)}, "average_heart_rate": scalar{math.Round(avgHr)}, "max_heart_rate": scalar{math.Round(avgHr + 18)},
			}, map[string]any{
				"heart_rate": samples(rng, start, dur, 60, avgHr, 10, 1.5, phase),
				"route_gpx":  routeGPX(rng, start, dur, dur/5, radius, phase, 15+rng.Float64()*20),
			})
		case kind < 0.72: // ride
			dur := int((45 + rng.Float64()*120*(0.5+season)) * 60)
			speed := 6.2 + rng.Float64()*1.8
			dist := speed * float64(dur)
			radius := dist / (2 * math.Pi * 1.03)
			avgHr := 130 + rng.Float64()*20
			avgPower := 160 + rng.Float64()*60
			add(id, "cycling", start, dur, map[string]any{
				"distance": scalar{math.Round(dist)}, "average_speed": scalar{speed}, "calories": scalar{math.Round(float64(dur) / 60 * 10)},
				"elevation_gain": scalar{math.Round(100 + rng.Float64()*600)}, "average_heart_rate": scalar{math.Round(avgHr)}, "max_heart_rate": scalar{math.Round(avgHr + 25)},
				"average_power": scalar{math.Round(avgPower)}, "average_cadence": scalar{86},
			}, map[string]any{
				"heart_rate": samples(rng, start, dur, 60, avgHr, 14, 2.2, phase),
				"power":      samples(rng, start, dur, 5, avgPower, 55, 3, phase),
				"cadence":    samples(rng, start, dur, 15, 86, 8, 2, phase),
				"route_gpx":  routeGPX(rng, start, dur, dur/6, radius, phase, 40+rng.Float64()*60),
			})
		case kind < 0.8: // pool swim
			dur := int((30 + rng.Float64()*25) * 60)
			avgHr := 125 + rng.Float64()*15
			add(id, "swimming", start, dur, map[string]any{
				"distance": scalar{math.Round(float64(dur) * 0.9)}, "calories": scalar{math.Round(float64(dur) / 60 * 9)},
				"average_heart_rate": scalar{math.Round(avgHr)}, "max_heart_rate": scalar{math.Round(avgHr + 20)}, "is_indoor": true,
			}, map[string]any{"heart_rate": samples(rng, start, dur, 60, avgHr, 8, 2, phase)})
		case kind < 0.9: // walk, HR only
			dur := int((25 + rng.Float64()*50) * 60)
			add(id, "walking", start, dur, map[string]any{
				"distance": scalar{math.Round(float64(dur) * 1.35)}, "calories": scalar{math.Round(float64(dur) / 60 * 5)},
				"average_heart_rate": scalar{102},
			}, map[string]any{"heart_rate": samples(rng, start, dur, 60, 102, 6, 1, phase)})
		case kind < 0.95: // yoga: summary only
			dur := int((30 + rng.Float64()*30) * 60)
			add(id, "yoga", start, dur, map[string]any{"calories": scalar{math.Round(float64(dur) / 60 * 4)}, "average_heart_rate": scalar{92}}, nil)
		default: // strength
			dur := int((35 + rng.Float64()*30) * 60)
			add(id, "strength", start, dur, map[string]any{"calories": scalar{math.Round(float64(dur) / 60 * 6)}, "average_heart_rate": scalar{118}, "max_heart_rate": scalar{150}},
				map[string]any{"heart_rate": samples(rng, start, dur, 60, 118, 15, 4, phase)})
		}
	}
	return out
}

// Handler serves the workouts at the router paths the backend calls: provider discovery and the
// health-data service's workout list/detail endpoints (shortname "health").
func Handler(workouts map[string]Workout) http.Handler {
	var summaries []map[string]any
	for _, w := range workouts {
		summaries = append(summaries, w.summary)
	}
	sort.Slice(summaries, func(i, j int) bool { return summaries[i]["start"].(string) < summaries[j]["start"].(string) })
	write := func(w http.ResponseWriter, status int, v any) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(v)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/services/v2/providers", func(w http.ResponseWriter, r *http.Request) {
		write(w, 200, []map[string]any{{"app_id": "dev-health", "app_name": "dev-health", "status": "running", "is_default": true}})
	})
	const prefix = "/api/services/v2/call/health/v1/workouts"
	mux.HandleFunc(prefix, func(w http.ResponseWriter, r *http.Request) {
		data := summaries
		if s := r.URL.Query().Get("start"); s != "" {
			data = nil
			for _, x := range summaries {
				if x["start"].(string) >= s {
					data = append(data, x)
				}
			}
		}
		write(w, 200, map[string]any{"count": len(data), "data": data})
	})
	mux.HandleFunc(prefix+"/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, prefix+"/")
		if wk, ok := workouts[id]; ok {
			write(w, 200, wk.detail)
			return
		}
		write(w, 404, map[string]string{"error": "not found"})
	})
	return mux
}
