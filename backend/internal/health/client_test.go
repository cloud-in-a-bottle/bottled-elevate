package health

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var workouts = map[string][]map[string]any{
	"apple": {
		{"id": "a1", "source": "apple-health", "start": "2026-10-01T10:00:00+00:00", "end": "2026-10-01T11:00:00+00:00"},
		{"id": "a2", "source": "apple-health", "start": "2026-10-12T10:00:00+00:00", "end": "2026-10-12T11:00:00+00:00"},
	},
	"oura": {{"id": "o1", "source": "oura", "start": "2026-10-10T00:57:00+00:00", "end": "2026-10-10T01:30:00+00:00"}},
}

// fakeRouter stands in for the Cloud in a Bottle router with two running providers.
func fakeRouter(t *testing.T, wrapped bool) *Client {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			t.Errorf("missing app token")
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/services/v2/providers" {
			list := []map[string]any{
				{"app_id": "apple", "status": "running"}, {"app_id": "oura", "status": "running"}, {"app_id": "gone", "status": "stopped"},
			}
			if wrapped {
				_ = json.NewEncoder(w).Encode(map[string]any{"providers": list})
			} else {
				_ = json.NewEncoder(w).Encode(list)
			}
			return
		}
		provider := r.Header.Get("X-OpenHost-Provider")
		rest := strings.TrimPrefix(r.URL.Path, "/api/services/v2/call/health")
		if rest == "/v1/workouts" {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": workouts[provider]})
			return
		}
		id := strings.TrimPrefix(rest, "/v1/workouts/")
		for _, wk := range workouts[provider] {
			if wk["id"] == id {
				_ = json.NewEncoder(w).Encode(wk)
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":"not found"}`))
	}))
	t.Cleanup(srv.Close)
	return &Client{RouterURL: srv.URL, AppToken: "tok", Shortname: "health", HTTP: srv.Client()}
}

func TestListMergesEveryRunningProviderOldestFirst(t *testing.T) {
	for _, wrapped := range []bool{false, true} {
		got, err := fakeRouter(t, wrapped).ListWorkouts(context.Background(), time.Time{}, 5000)
		if err != nil {
			t.Fatal(err)
		}
		var ids []string
		for _, w := range got {
			ids = append(ids, w.ID)
		}
		if strings.Join(ids, ",") != "a1,o1,a2" {
			t.Fatalf("wrapped=%v ids = %v", wrapped, ids)
		}
	}
}

func TestWorkoutFoundOnNonDefaultProvider(t *testing.T) {
	w, err := fakeRouter(t, false).Workout(context.Background(), "o1")
	if err != nil || w.Source != "oura" {
		t.Fatalf("got %+v, %v", w, err)
	}
}

func TestWorkoutMissingEverywhereIsNotFound(t *testing.T) {
	if _, err := fakeRouter(t, false).Workout(context.Background(), "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}
