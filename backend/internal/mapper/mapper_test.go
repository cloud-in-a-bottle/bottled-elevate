package mapper

import (
	"testing"
)

func f(v float64) *Scalar { return &Scalar{Value: &v} }

func TestSportOf(t *testing.T) {
	for in, want := range map[string]string{
		"running": "Run", "cycling": "Ride", "strength": "WeightTraining", "yoga": "Yoga",
		"table_tennis": "TableTennis", "downhill_skiing": "AlpineSki", "underwater_basket_weaving": "Other",
	} {
		if got := SportOf(in); got != want {
			t.Errorf("SportOf(%q) = %q, want %q", in, got, want)
		}
	}
}

const gpx = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
<trkpt lat="37.0000" lon="-122.0000"><ele>10</ele><time>2026-06-01T15:00:00Z</time></trkpt>
<trkpt lat="37.0009" lon="-122.0000"><ele>12</ele><time>2026-06-01T15:00:20Z</time></trkpt>
<trkpt lat="37.0018" lon="-122.0000"><ele>11</ele><time>2026-06-01T15:00:40Z</time></trkpt>
</trkseg></trk></gpx>`

func TestBuildStreamsFromRouteInterpolatesHR(t *testing.T) {
	a, b := 100.0, 140.0
	w := &Workout{
		Start: "2026-06-01T15:00:00Z", End: "2026-06-01T15:00:40Z", RouteGPX: gpx,
		HeartRate: &TimeSeries{Samples: []Sample{{Timestamp: "2026-06-01T15:00:00Z", Value: &a}, {Timestamp: "2026-06-01T15:00:40Z", Value: &b}}},
	}
	s := BuildStreams(w)
	if len(s.Time) != 3 || s.Time[2] != 40 || len(s.LatLng) != 3 {
		t.Fatalf("streams = %+v", s)
	}
	if s.Distance[1] < 99 || s.Distance[1] > 101 { // 0.0009° of latitude ≈ 100m
		t.Fatalf("distance = %v", s.Distance)
	}
	if s.Heartrate[1] != 120 || s.Altitude[1] != 12 {
		t.Fatalf("hr = %v alt = %v", s.Heartrate, s.Altitude)
	}
}

func TestBuildStreamsWithoutRouteUsesDensestTrace(t *testing.T) {
	v := 200.0
	power := &TimeSeries{}
	for _, ts := range []string{"2026-06-01T15:00:00Z", "2026-06-01T15:00:05Z", "2026-06-01T15:00:10Z"} {
		power.Samples = append(power.Samples, Sample{Timestamp: ts, Value: &v})
	}
	s := BuildStreams(&Workout{Power: power, IsIndoor: true, RouteGPX: gpx})
	if len(s.Time) != 3 || len(s.Watts) != 3 || len(s.LatLng) != 0 {
		t.Fatalf("indoor streams = %+v", s)
	}
	if BuildStreams(&Workout{}) != nil {
		t.Fatal("expected nil streams without traces")
	}
}

func TestSourceStatsDeriveSpeedAndPace(t *testing.T) {
	w := &Workout{Start: "2026-06-01T15:00:00Z", End: "2026-06-01T16:00:00Z", Duration: f(50), Distance: f(10000), Calories: f(600)}
	src := w.SourceStats()
	if *src.ElapsedTime != 3000 || *src.AvgSpeed != 12 || *src.AvgPace != 300 || *src.CaloriesPerHour != 720 {
		t.Fatalf("src = elapsed %v speed %v pace %v cph %v", *src.ElapsedTime, *src.AvgSpeed, *src.AvgPace, *src.CaloriesPerHour)
	}
	if src.AvgHr != nil {
		t.Fatal("missing HR should stay null")
	}
}
