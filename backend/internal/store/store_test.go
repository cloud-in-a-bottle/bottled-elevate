package store

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
)

func TestActivityRoundTripAndCascade(t *testing.T) {
	path := filepath.Join(t.TempDir(), "main.db")
	st, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	a := &model.Activity{ID: "src:1", Name: "Ride", Type: model.Ride, StartTimestamp: 100}
	if err := st.PutActivity(a, &model.Streams{Time: []float64{0, 1}, Heartrate: []float64{100, 110}}); err != nil {
		t.Fatal(err)
	}
	got, _ := st.Activity("src:1")
	if got == nil || got.Name != "Ride" {
		t.Fatalf("activity = %+v", got)
	}
	s, _ := st.Streams("src:1")
	if s == nil || s.Heartrate[1] != 110 {
		t.Fatalf("streams = %+v", s)
	}
	st.Close()

	// Survives a reopen; deleting the activity drops its streams.
	st, _ = Open(path)
	defer st.Close()
	if n, _ := st.CountActivities(); n != 1 {
		t.Fatalf("count after reopen = %d", n)
	}
	if err := st.DeleteActivity("src:1"); err != nil {
		t.Fatal(err)
	}
	if s, _ := st.Streams("src:1"); s != nil {
		t.Fatal("streams survived their activity")
	}
}

func TestDefaultsWhenEmpty(t *testing.T) {
	st, _ := Open(filepath.Join(t.TempDir(), "main.db"))
	defer st.Close()
	a, _ := st.Athlete()
	if len(a.DatedAthleteSettings) != 1 || a.DatedAthleteSettings[0].Since != nil || a.Gender != model.Men {
		t.Fatalf("default athlete = %+v", a)
	}
	u, _ := st.UserSettings()
	if u.SystemUnit != model.Metric || len(u.Zones.HeartRate) == 0 {
		t.Fatalf("default settings = %+v", u)
	}
}

func TestImportsLegacyRecords(t *testing.T) {
	path := filepath.Join(t.TempDir(), "main.db")
	db, _ := sql.Open("sqlite", path)
	_, err := db.Exec(`CREATE TABLE records (collection TEXT, key TEXT, value TEXT, updated_at REAL, PRIMARY KEY (collection, key));
		INSERT INTO records VALUES ('athlete', 'singleton', '{"gender":"women","datedAthleteSettings":[{"since":null,"maxHr":180,"restHr":50,"lthr":{"default":null,"cycling":null,"running":null},"cyclingFtp":210,"runningFtp":null,"swimFtp":null,"weight":61}]}', 1);
		INSERT INTO records VALUES ('userSettings', 'singleton', '{"systemUnit":"imperial","temperatureUnit":"F","buildTarget":"EXTENSION"}', 1);
		INSERT INTO records VALUES ('yearProgressPresets', 'p1', '{"id":"p1","progressType":"distance"}', 1);
		INSERT INTO records VALUES ('activities', 'a:1', '{"id":"a:1"}', 1);`)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()

	st, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	a, _ := st.Athlete()
	if a.Gender != model.Women || *a.DatedAthleteSettings[0].CyclingFtp != 210 {
		t.Fatalf("athlete = %+v", a)
	}
	u, _ := st.UserSettings()
	if u.SystemUnit != model.Imperial || len(u.Zones.Speed) == 0 {
		t.Fatalf("settings = %+v", u)
	}
	var presets []map[string]any
	if found, _ := st.GetDoc(PrefPrefix+"yearProgressPresets", &presets); !found || len(presets) != 1 {
		t.Fatalf("presets = %v", presets)
	}
	if n, _ := st.CountActivities(); n != 0 {
		t.Fatal("legacy activities should be re-synced, not imported")
	}
	// The legacy table is renamed, so a restart doesn't re-import over newer settings.
	st.PutDoc(KeyUserSettings, model.DefaultUserSettings())
	st.Close()
	st2, _ := Open(path)
	defer st2.Close()
	if u, _ := st2.UserSettings(); u.SystemUnit != model.Metric {
		t.Fatal("legacy settings were re-imported on restart")
	}
}
