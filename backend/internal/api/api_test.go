package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/devdata"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/health"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/store"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/syncer"
)

type harness struct {
	t   *testing.T
	srv *httptest.Server
}

func newHarness(t *testing.T) *harness {
	router := httptest.NewServer(devdata.Handler(devdata.Build(time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC), 2)))
	t.Cleanup(router.Close)
	st, err := store.Open(filepath.Join(t.TempDir(), "main.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	static := t.TempDir()
	_ = os.WriteFile(filepath.Join(static, "index.html"), []byte("<html>app</html>"), 0o644)
	hc := &health.Client{RouterURL: router.URL, AppToken: "dev", Shortname: "health", HTTP: router.Client()}
	srv := httptest.NewServer((&Server{Store: st, Syncer: syncer.New(st, hc), StaticDir: static}).Handler())
	t.Cleanup(srv.Close)
	return &harness{t: t, srv: srv}
}

func (h *harness) do(method, path string, body any, out any) int {
	h.t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, h.srv.URL+path, r)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatal(err)
	}
	defer resp.Body.Close()
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			h.t.Fatalf("%s %s: decode: %v", method, path, err)
		}
	}
	return resp.StatusCode
}

// waitIdle polls status until no job runs, returning the final status.
func (h *harness) waitIdle() syncer.Status {
	h.t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		var st syncer.Status
		h.do("GET", "/api/status", nil, &st)
		if !st.Running {
			return st
		}
		time.Sleep(50 * time.Millisecond)
	}
	h.t.Fatal("job did not finish")
	return syncer.Status{}
}

func TestSyncThenBrowse(t *testing.T) {
	h := newHarness(t)
	var st syncer.Status
	h.do("GET", "/api/status", nil, &st)
	if st.State != syncer.NotSynced {
		t.Fatalf("initial state = %s", st.State)
	}
	time.Sleep(20 * time.Millisecond)
	if code := h.do("POST", "/api/sync", map[string]string{"mode": "full"}, nil); code != http.StatusAccepted {
		t.Fatalf("sync status %d", code)
	}
	// The first poll may land before the job goroutine starts.
	time.Sleep(50 * time.Millisecond)
	st = h.waitIdle()
	if st.State != syncer.Synced || st.Activities == 0 || st.LastError != "" {
		t.Fatalf("after sync: %+v", st)
	}

	var list []model.Activity
	h.do("GET", "/api/activities", nil, &list)
	if len(list) != st.Activities {
		t.Fatalf("listed %d of %d", len(list), st.Activities)
	}
	var run *model.Activity
	for i := range list {
		if list[i].Type == model.Run && list[i].HasMap {
			run = &list[i]
		}
		if list[i].Stats.HeartRate != nil && list[i].Stats.HeartRate.Zones != nil {
			t.Fatal("list should not carry zones")
		}
	}
	if run == nil {
		t.Fatal("no outdoor run synced")
	}

	var detail model.Activity
	h.do("GET", "/api/activities/"+run.ID, nil, &detail)
	if len(detail.Laps) == 0 || len(detail.Stats.HeartRate.Zones) == 0 || len(detail.Stats.Speed.Peaks) == 0 {
		t.Fatalf("detail lacks laps/zones/peaks: laps=%d", len(detail.Laps))
	}
	if !model.Truthy(detail.Stats.Scores.Stress.Hrss) || detail.Stats.Pace.GapAvg == nil {
		t.Fatalf("detail lacks hrss/gap: %+v", detail.Stats.Scores.Stress)
	}

	var streams model.Streams
	h.do("GET", "/api/activities/"+run.ID+"/streams", nil, &streams)
	if len(streams.GradeAdjustedSpeed) != len(streams.Time) || len(streams.Watts) != len(streams.Time) {
		t.Fatal("display streams should carry GAP and estimated running power")
	}

	// A fast re-sync imports nothing new.
	h.do("POST", "/api/sync", map[string]string{"mode": "fast"}, nil)
	time.Sleep(50 * time.Millisecond)
	if again := h.waitIdle(); again.Activities != st.Activities || again.Total != 0 {
		t.Fatalf("fast re-sync: %+v", again)
	}

	// Editing the sport re-derives the stats.
	var edited model.Activity
	h.do("PATCH", "/api/activities/"+run.ID, map[string]string{"type": "Walk", "name": "Easy one"}, &edited)
	if edited.Type != "Walk" || edited.Name != "Easy one" || edited.Stats.Pace.GapAvg != nil {
		t.Fatalf("edited = %s %q gap=%v", edited.Type, edited.Name, edited.Stats.Pace.GapAvg)
	}

	// Setting a running threshold pace recomputes every activity with running stress scores.
	var athlete model.Athlete
	h.do("GET", "/api/athlete", nil, &athlete)
	pace := 270.0
	athlete.DatedAthleteSettings[0].RunningFtp = &pace
	if code := h.do("PUT", "/api/athlete", athlete, nil); code != http.StatusOK {
		t.Fatalf("put athlete: %d", code)
	}
	time.Sleep(50 * time.Millisecond)
	h.waitIdle()
	h.do("GET", "/api/activities", nil, &list)
	withRss := 0
	for _, a := range list {
		if a.Type == model.Run && model.Truthy(a.Stats.Scores.Stress.Rss) {
			withRss++
		}
	}
	if withRss == 0 {
		t.Fatal("no run got a running stress score after setting the threshold pace")
	}

	if code := h.do("DELETE", "/api/activities/"+run.ID, nil, nil); code != http.StatusOK {
		t.Fatalf("delete: %d", code)
	}
	if code := h.do("GET", "/api/activities/"+run.ID, nil, nil); code != http.StatusNotFound {
		t.Fatalf("deleted activity still served: %d", code)
	}
}

func TestAthleteValidation(t *testing.T) {
	h := newHarness(t)
	bad := model.DefaultAthlete()
	bad.DatedAthleteSettings[0].RestHr = 200
	if code := h.do("PUT", "/api/athlete", bad, nil); code != http.StatusBadRequest {
		t.Fatalf("rest > max accepted: %d", code)
	}
	since := "2026-01-01"
	twoForever := model.DefaultAthlete()
	twoForever.DatedAthleteSettings = append(twoForever.DatedAthleteSettings, twoForever.DatedAthleteSettings[0])
	if code := h.do("PUT", "/api/athlete", twoForever, nil); code != http.StatusBadRequest {
		t.Fatalf("two forever periods accepted: %d", code)
	}
	ok := model.DefaultAthlete()
	ok.DatedAthleteSettings = append(ok.DatedAthleteSettings, model.DatedAthleteSettings{Since: &since, AthleteSettings: model.DefaultAthleteSettings()})
	if code := h.do("PUT", "/api/athlete", ok, nil); code != http.StatusOK {
		t.Fatalf("valid athlete rejected: %d", code)
	}
}

func TestPrefsAndStatic(t *testing.T) {
	h := newHarness(t)
	var v any
	h.do("GET", "/api/prefs/fitnessTrendConfig", nil, &v)
	if v != nil {
		t.Fatalf("missing pref = %v", v)
	}
	h.do("PUT", "/api/prefs/fitnessTrendConfig", map[string]int{"initialFitness": 12}, nil)
	var got map[string]int
	h.do("GET", "/api/prefs/fitnessTrendConfig", nil, &got)
	if got["initialFitness"] != 12 {
		t.Fatalf("pref = %v", got)
	}
	resp, _ := http.Get(h.srv.URL + "/some/client/route")
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "<html>app</html>" {
		t.Fatalf("SPA fallback served %q", body)
	}
	if code := h.do("GET", "/api/nope", nil, nil); code != http.StatusNotFound {
		t.Fatalf("unknown api route: %d", code)
	}
}
