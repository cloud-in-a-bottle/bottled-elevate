// Package store persists activities, their raw streams, and small JSON documents in sqlite.
package store

import (
	"bytes"
	"compress/gzip"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	_ "modernc.org/sqlite"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
)

// Document keys in the kv table.
const (
	KeyAthlete      = "athlete"
	KeyUserSettings = "userSettings"
	KeySyncState    = "syncState"
	PrefPrefix      = "pref:"
)

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", path))
	if err != nil {
		return nil, err
	}
	// One writer at a time keeps sqlite happy; reads are cheap enough to share it.
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS activities (
			id TEXT PRIMARY KEY,
			start_timestamp INTEGER NOT NULL,
			doc TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS activities_start ON activities(start_timestamp);
		CREATE TABLE IF NOT EXISTS streams (
			activity_id TEXT PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
			data BLOB NOT NULL
		);
		CREATE TABLE IF NOT EXISTS kv (
			key TEXT PRIMARY KEY,
			doc TEXT NOT NULL
		);`)
	if err != nil {
		return err
	}
	return s.importLegacy()
}

// importLegacy carries settings over from the Angular app's generic `records` table (athlete,
// user settings, year-progress presets). Activities aren't imported: the next sync rebuilds them
// from the health-data service with the new server-side computation.
func (s *Store) importLegacy() error {
	var name string
	err := s.db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='records'`).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	rows, err := s.db.Query(`SELECT collection, value FROM records WHERE collection IN ('athlete','userSettings','yearProgressPresets')`)
	if err != nil {
		return err
	}
	var presets []json.RawMessage
	docs := map[string]string{}
	for rows.Next() {
		var coll, value string
		if err := rows.Scan(&coll, &value); err != nil {
			rows.Close()
			return err
		}
		switch coll {
		case "athlete":
			docs[KeyAthlete] = value
		case "userSettings":
			docs[KeyUserSettings] = value
		case "yearProgressPresets":
			presets = append(presets, json.RawMessage(value))
		}
	}
	rows.Close()
	if presets != nil {
		b, _ := json.Marshal(presets)
		docs[PrefPrefix+"yearProgressPresets"] = string(b)
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for k, v := range docs {
		if _, err := tx.Exec(`INSERT OR IGNORE INTO kv(key, doc) VALUES(?, ?)`, k, v); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`ALTER TABLE records RENAME TO legacy_records`); err != nil {
		return err
	}
	return tx.Commit()
}

// --- kv documents ---

// GetDoc unmarshals the document at key into out; found is false when it doesn't exist.
func (s *Store) GetDoc(key string, out any) (bool, error) {
	var doc string
	err := s.db.QueryRow(`SELECT doc FROM kv WHERE key = ?`, key).Scan(&doc)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal([]byte(doc), out)
}

func (s *Store) GetRaw(key string) (json.RawMessage, error) {
	var doc string
	err := s.db.QueryRow(`SELECT doc FROM kv WHERE key = ?`, key).Scan(&doc)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return json.RawMessage(doc), err
}

func (s *Store) PutDoc(key string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO kv(key, doc) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET doc = excluded.doc`, key, string(b))
	return err
}

func (s *Store) DeleteDoc(key string) error {
	_, err := s.db.Exec(`DELETE FROM kv WHERE key = ?`, key)
	return err
}

func (s *Store) Athlete() (model.Athlete, error) {
	a := model.DefaultAthlete()
	found, err := s.GetDoc(KeyAthlete, &a)
	if err != nil {
		return model.DefaultAthlete(), err
	}
	if !found || len(a.DatedAthleteSettings) == 0 {
		a.DatedAthleteSettings = model.DefaultAthlete().DatedAthleteSettings
	}
	if a.Gender == "" {
		a.Gender = model.Men
	}
	if a.Sports == nil {
		a.Sports = []string{}
	}
	return a, nil
}

func (s *Store) UserSettings() (model.UserSettings, error) {
	u := model.DefaultUserSettings()
	if _, err := s.GetDoc(KeyUserSettings, &u); err != nil {
		return model.DefaultUserSettings(), err
	}
	if u.SystemUnit == "" {
		u.SystemUnit = model.Metric
	}
	if u.TemperatureUnit == "" {
		u.TemperatureUnit = "C"
	}
	fillZones(&u.Zones)
	return u, nil
}

func fillZones(z *model.UserZones) {
	d := model.DefaultZones()
	fill := func(dst *[]float64, def []float64) {
		if len(*dst) < 2 {
			*dst = def
		}
	}
	fill(&z.Speed, d.Speed)
	fill(&z.Pace, d.Pace)
	fill(&z.HeartRate, d.HeartRate)
	fill(&z.Power, d.Power)
	fill(&z.RunningPower, d.RunningPower)
	fill(&z.CyclingCadence, d.CyclingCadence)
	fill(&z.RunningCadence, d.RunningCadence)
	fill(&z.Grade, d.Grade)
	fill(&z.Elevation, d.Elevation)
	fill(&z.Ascent, d.Ascent)
}

// --- activities ---

// PutActivity upserts an activity, and its raw streams when given.
func (s *Store) PutActivity(a *model.Activity, streams *model.Streams) error {
	doc, err := json.Marshal(a)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO activities(id, start_timestamp, doc) VALUES(?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET start_timestamp = excluded.start_timestamp, doc = excluded.doc`,
		a.ID, a.StartTimestamp, string(doc)); err != nil {
		return err
	}
	if streams != nil && !streams.IsEmpty() {
		blob, err := gz(streams)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO streams(activity_id, data) VALUES(?, ?)
			ON CONFLICT(activity_id) DO UPDATE SET data = excluded.data`, a.ID, blob); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func gz(v any) ([]byte, error) {
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (s *Store) Activity(id string) (*model.Activity, error) {
	var doc string
	err := s.db.QueryRow(`SELECT doc FROM activities WHERE id = ?`, id).Scan(&doc)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var a model.Activity
	return &a, json.Unmarshal([]byte(doc), &a)
}

// Activities returns every activity, oldest first.
func (s *Store) Activities() ([]*model.Activity, error) {
	rows, err := s.db.Query(`SELECT doc FROM activities ORDER BY start_timestamp`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*model.Activity{}
	for rows.Next() {
		var doc string
		if err := rows.Scan(&doc); err != nil {
			return nil, err
		}
		var a model.Activity
		if err := json.Unmarshal([]byte(doc), &a); err != nil {
			return nil, err
		}
		out = append(out, &a)
	}
	return out, rows.Err()
}

func (s *Store) ActivityIDs() (map[string]bool, error) {
	rows, err := s.db.Query(`SELECT id FROM activities`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids[id] = true
	}
	return ids, rows.Err()
}

func (s *Store) CountActivities() (int, error) {
	var n int
	return n, s.db.QueryRow(`SELECT COUNT(*) FROM activities`).Scan(&n)
}

// Streams returns an activity's raw streams, or nil when it has none.
func (s *Store) Streams(id string) (*model.Streams, error) {
	var blob []byte
	err := s.db.QueryRow(`SELECT data FROM streams WHERE activity_id = ?`, id).Scan(&blob)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r, err := gzip.NewReader(bytes.NewReader(blob))
	if err != nil {
		return nil, err
	}
	raw, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	var st model.Streams
	return &st, json.Unmarshal(raw, &st)
}

func (s *Store) DeleteActivity(id string) error {
	_, err := s.db.Exec(`DELETE FROM activities WHERE id = ?`, id)
	return err
}

func (s *Store) ClearActivities() error {
	_, err := s.db.Exec(`DELETE FROM streams; DELETE FROM activities;`)
	return err
}
