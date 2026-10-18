// Package api is the HTTP surface: JSON endpoints under /api and the static SolidJS build.
package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/compute"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/store"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/syncer"
)

type Server struct {
	Store     *store.Store
	Syncer    *syncer.Syncer
	StaticDir string
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /api/status", s.status)
	mux.HandleFunc("POST /api/sync", s.startSync)
	mux.HandleFunc("POST /api/sync/stop", s.stopSync)

	mux.HandleFunc("GET /api/activities", s.listActivities)
	mux.HandleFunc("GET /api/activities/{id}", s.getActivity)
	mux.HandleFunc("GET /api/activities/{id}/streams", s.getStreams)
	mux.HandleFunc("PATCH /api/activities/{id}", s.patchActivity)
	mux.HandleFunc("DELETE /api/activities/{id}", s.deleteActivity)
	mux.HandleFunc("POST /api/activities/{id}/recalculate", s.recalculateActivity)
	mux.HandleFunc("POST /api/activities/recalculate", s.recalculateAll)

	mux.HandleFunc("GET /api/athlete", s.getAthlete)
	mux.HandleFunc("PUT /api/athlete", s.putAthlete)
	mux.HandleFunc("DELETE /api/athlete", s.resetAthlete)
	mux.HandleFunc("GET /api/settings", s.getSettings)
	mux.HandleFunc("PUT /api/settings", s.putSettings)
	mux.HandleFunc("DELETE /api/settings", s.resetSettings)

	mux.HandleFunc("GET /api/prefs/{key}", s.getPref)
	mux.HandleFunc("PUT /api/prefs/{key}", s.putPref)
	mux.HandleFunc("DELETE /api/prefs/{key}", s.deletePref)

	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not found")
	})
	mux.Handle("/", s.static())
	return gzipMiddleware(mux)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Warn("write response", "err", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func internalError(w http.ResponseWriter, err error) {
	slog.Error("request failed", "err", err)
	writeError(w, http.StatusInternalServerError, err.Error())
}

func readJSON(r *http.Request, v any) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(body, v)
}

// --- sync ---

func (s *Server) status(w http.ResponseWriter, r *http.Request) {
	st, err := s.Syncer.Status()
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) startSync(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Mode syncer.Mode `json:"mode"`
	}
	_ = readJSON(r, &req)
	switch req.Mode {
	case syncer.Fast, syncer.Full, syncer.Force:
	case "":
		req.Mode = syncer.Fast
	default:
		writeError(w, http.StatusBadRequest, "mode must be fast, full or force")
		return
	}
	started := s.Syncer.StartSync(req.Mode)
	writeJSON(w, http.StatusAccepted, map[string]bool{"started": started})
}

func (s *Server) stopSync(w http.ResponseWriter, r *http.Request) {
	s.Syncer.Stop()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- activities ---

// slim drops the bulky per-activity arrays (zones, peaks, laps) for list views; the detail
// endpoint serves them.
func slim(a *model.Activity) *model.Activity {
	c := *a
	st := c.Stats
	if st.Speed != nil {
		v := *st.Speed
		v.Zones, v.Peaks = nil, nil
		st.Speed = &v
	}
	if st.Pace != nil {
		v := *st.Pace
		v.Zones = nil
		st.Pace = &v
	}
	if st.Power != nil {
		v := *st.Power
		v.Zones, v.Peaks = nil, nil
		st.Power = &v
	}
	if st.HeartRate != nil {
		v := *st.HeartRate
		v.Zones, v.Peaks = nil, nil
		st.HeartRate = &v
	}
	if st.Cadence != nil {
		v := *st.Cadence
		v.Zones, v.Peaks = nil, nil
		st.Cadence = &v
	}
	if st.Grade != nil {
		v := *st.Grade
		v.Zones = nil
		st.Grade = &v
	}
	if st.Elevation != nil {
		v := *st.Elevation
		v.ElevationZones = nil
		st.Elevation = &v
	}
	c.Stats = st
	c.Laps = nil
	return &c
}

func (s *Server) listActivities(w http.ResponseWriter, r *http.Request) {
	all, err := s.Store.Activities()
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]*model.Activity, len(all))
	for i, a := range all {
		out[i] = slim(a)
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) loadActivity(w http.ResponseWriter, r *http.Request) *model.Activity {
	a, err := s.Store.Activity(r.PathValue("id"))
	if err != nil {
		internalError(w, err)
		return nil
	}
	if a == nil {
		writeError(w, http.StatusNotFound, "activity not found")
		return nil
	}
	return a
}

func (s *Server) displayStreams(a *model.Activity) (*model.Streams, error) {
	raw, err := s.Store.Streams(a.ID)
	if err != nil || raw == nil {
		return nil, err
	}
	return compute.ProcessStreams(raw, compute.StreamParams{
		Type: a.Type, HasPowerMeter: a.HasPowerMeter, IsSwimPool: a.IsSwimPool, Weight: a.AthleteSnapshot.AthleteSettings.Weight,
	}), nil
}

func (s *Server) getActivity(w http.ResponseWriter, r *http.Request) {
	a := s.loadActivity(w, r)
	if a == nil {
		return
	}
	streams, err := s.displayStreams(a)
	if err != nil {
		internalError(w, err)
		return
	}
	settings, err := s.Store.UserSettings()
	if err != nil {
		internalError(w, err)
		return
	}
	a.Laps = compute.BuildLaps(streams, settings.SystemUnit)
	writeJSON(w, http.StatusOK, a)
}

// getStreams serves the display-processed streams (smoothed, grade/GAP/estimated power derived).
func (s *Server) getStreams(w http.ResponseWriter, r *http.Request) {
	a := s.loadActivity(w, r)
	if a == nil {
		return
	}
	streams, err := s.displayStreams(a)
	if err != nil {
		internalError(w, err)
		return
	}
	if streams == nil {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	writeJSON(w, http.StatusOK, streams)
}

func (s *Server) patchActivity(w http.ResponseWriter, r *http.Request) {
	a := s.loadActivity(w, r)
	if a == nil {
		return
	}
	var req struct {
		Name    *string `json:"name"`
		Type    *string `json:"type"`
		Notes   *string `json:"notes"`
		Trainer *bool   `json:"trainer"`
		Commute *bool   `json:"commute"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	typeChanged := false
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" && *req.Name != a.Name {
		a.Name = strings.TrimSpace(*req.Name)
		a.UserEditedName = true
	}
	if req.Type != nil && *req.Type != a.Type {
		if !model.IsSport(*req.Type) {
			writeError(w, http.StatusBadRequest, "unknown sport type")
			return
		}
		a.Type = *req.Type
		a.UserEditedType = true
		typeChanged = true
	}
	if req.Notes != nil {
		a.Notes = *req.Notes
	}
	if req.Trainer != nil {
		a.Trainer = *req.Trainer
	}
	if req.Commute != nil {
		a.Commute = *req.Commute
	}
	a.LastEditTime = time.Now().UTC().Format(time.RFC3339)
	var err error
	if typeChanged {
		// Sport drives moving thresholds, power estimation and scores: re-derive everything.
		err = s.Syncer.Recompute(a)
	} else {
		err = s.Store.PutActivity(a, nil)
	}
	if err != nil {
		internalError(w, err)
		return
	}
	s.Syncer.Touch()
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) deleteActivity(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.DeleteActivity(r.PathValue("id")); err != nil {
		internalError(w, err)
		return
	}
	s.Syncer.Touch()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) recalculateActivity(w http.ResponseWriter, r *http.Request) {
	a := s.loadActivity(w, r)
	if a == nil {
		return
	}
	if err := s.Syncer.Recompute(a); err != nil {
		internalError(w, err)
		return
	}
	s.Syncer.Touch()
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) recalculateAll(w http.ResponseWriter, r *http.Request) {
	s.Syncer.RequestRecompute()
	writeJSON(w, http.StatusAccepted, map[string]bool{"started": true})
}

// --- athlete & settings ---

func (s *Server) getAthlete(w http.ResponseWriter, r *http.Request) {
	a, err := s.Store.Athlete()
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func validateAthlete(a *model.Athlete) error {
	if a.Gender != model.Men && a.Gender != model.Women {
		return errors.New("gender must be men or women")
	}
	if len(a.DatedAthleteSettings) == 0 {
		return errors.New("at least one dated settings period is required")
	}
	forever := 0
	seen := map[string]bool{}
	for _, d := range a.DatedAthleteSettings {
		if d.Since == nil {
			forever++
		} else if _, err := time.Parse("2006-01-02", *d.Since); err != nil {
			return errors.New("since dates must be YYYY-MM-DD")
		} else if seen[*d.Since] {
			return errors.New("two settings periods start on " + *d.Since)
		} else {
			seen[*d.Since] = true
		}
		if d.MaxHr <= d.RestHr || d.RestHr <= 0 || d.Weight <= 0 {
			return errors.New("max HR must exceed rest HR, and rest HR and weight must be positive")
		}
	}
	if forever != 1 {
		return errors.New("exactly one settings period must have no start date")
	}
	if a.Sports == nil {
		a.Sports = []string{}
	}
	return nil
}

func (s *Server) putAthlete(w http.ResponseWriter, r *http.Request) {
	var a model.Athlete
	if err := readJSON(r, &a); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := validateAthlete(&a); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	prev, err := s.Store.Athlete()
	if err != nil {
		internalError(w, err)
		return
	}
	// Names, practice level and sports don't feed any stat; only re-derive when something does.
	affectsStats := prev.Gender != a.Gender || !reflect.DeepEqual(prev.BirthDate, a.BirthDate) ||
		!reflect.DeepEqual(prev.DatedAthleteSettings, a.DatedAthleteSettings)
	s.saveAndRecompute(w, store.KeyAthlete, &a, affectsStats)
}

func (s *Server) resetAthlete(w http.ResponseWriter, r *http.Request) {
	a := model.DefaultAthlete()
	s.saveAndRecompute(w, store.KeyAthlete, &a, true)
}

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	u, err := s.Store.UserSettings()
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (s *Server) putSettings(w http.ResponseWriter, r *http.Request) {
	prev, err := s.Store.UserSettings()
	if err != nil {
		internalError(w, err)
		return
	}
	var u model.UserSettings
	if err := readJSON(r, &u); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if u.SystemUnit != model.Metric && u.SystemUnit != model.Imperial {
		writeError(w, http.StatusBadRequest, "systemUnit must be metric or imperial")
		return
	}
	s.saveAndRecompute(w, store.KeyUserSettings, &u, !reflect.DeepEqual(prev.Zones, u.Zones))
}

func (s *Server) resetSettings(w http.ResponseWriter, r *http.Request) {
	u := model.DefaultUserSettings()
	s.saveAndRecompute(w, store.KeyUserSettings, &u, true)
}

// saveAndRecompute persists a settings document and, when it affects derived stats, re-derives
// every activity in the background.
func (s *Server) saveAndRecompute(w http.ResponseWriter, key string, v any, recompute bool) {
	if err := s.Store.PutDoc(key, v); err != nil {
		internalError(w, err)
		return
	}
	if recompute {
		s.Syncer.RequestRecompute()
	}
	writeJSON(w, http.StatusOK, v)
}

// --- prefs: small UI documents (fitness trend config, year progress presets, ...) ---

func (s *Server) getPref(w http.ResponseWriter, r *http.Request) {
	raw, err := s.Store.GetRaw(store.PrefPrefix + r.PathValue("key"))
	if err != nil {
		internalError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if raw == nil {
		_, _ = w.Write([]byte("null"))
		return
	}
	_, _ = w.Write(raw)
}

func (s *Server) putPref(w http.ResponseWriter, r *http.Request) {
	var v json.RawMessage
	if err := readJSON(r, &v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := s.Store.PutDoc(store.PrefPrefix+r.PathValue("key"), v); err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) deletePref(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.DeleteDoc(store.PrefPrefix + r.PathValue("key")); err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- static SPA ---

// static serves the built frontend, falling back to index.html for client-side routes.
func (s *Server) static() http.Handler {
	files := http.FileServer(http.Dir(s.StaticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := filepath.Clean("/" + r.URL.Path)
		info, err := os.Stat(filepath.Join(s.StaticDir, clean))
		if err != nil || info.IsDir() {
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, filepath.Join(s.StaticDir, "index.html"))
			return
		}
		if strings.HasPrefix(clean, "/assets/") {
			// Vite fingerprints asset names, so they can be cached forever.
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		files.ServeHTTP(w, r)
	})
}
