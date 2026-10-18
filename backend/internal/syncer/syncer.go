// Package syncer imports workouts from the health-data service and keeps derived stats current.
package syncer

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"sync"
	"time"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/compute"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/health"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/mapper"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/model"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/store"
)

const (
	listLimit         = 5000
	fastSyncWindow    = 7 * 24 * time.Hour // re-listed on a fast sync: covers tz skew + late edits
	detailConcurrency = 8
	requestTimeout    = 30 * time.Second
)

type Mode string

const (
	Fast  Mode = "fast"  // only the recent window, once a full pass has completed
	Full  Mode = "full"  // list everything, import what's missing
	Force Mode = "force" // wipe activities and re-import everything
)

// State of the local data relative to the health-data service.
const (
	NotSynced       = "NOT_SYNCED"
	PartiallySynced = "PARTIALLY_SYNCED"
	Synced          = "SYNCED"
)

type persisted struct {
	LastSyncTime *time.Time `json:"lastSyncTime"`
}

// Status is what the UI polls.
type Status struct {
	State        string     `json:"state"`
	Running      bool       `json:"running"`
	Job          string     `json:"job,omitempty"` // "sync" or "recompute"
	Done         int        `json:"done"`
	Total        int        `json:"total"`
	LastSyncTime *time.Time `json:"lastSyncTime"`
	LastError    string     `json:"lastError,omitempty"`
	Activities   int        `json:"activities"`
	// Revision bumps whenever activities change, so clients know to refetch.
	Revision int64 `json:"revision"`
}

type Syncer struct {
	store  *store.Store
	health *health.Client

	jobMu sync.Mutex // serializes sync and recompute jobs

	mu               sync.Mutex
	running          bool
	job              string
	done, total      int
	lastError        string
	cancel           context.CancelFunc
	recomputePending bool
	syncPending      bool
	revision         int64
}

func New(st *store.Store, hc *health.Client) *Syncer {
	return &Syncer{store: st, health: hc, revision: time.Now().UnixMilli()}
}

func (s *Syncer) Status() (Status, error) {
	// Snapshot the job state before reading the store: a job that has finished by now has also
	// persisted its results, so "not running" never pairs with stale data.
	s.mu.Lock()
	st := Status{Running: s.running, Job: s.job, Done: s.done, Total: s.total, LastError: s.lastError, Revision: s.revision}
	if !s.running && (s.syncPending || s.recomputePending) {
		// Accepted but not started yet: report it as running so clients don't flash idle.
		st.Running, st.Job = true, "sync"
		if !s.syncPending {
			st.Job = "recompute"
		}
	}
	s.mu.Unlock()
	var p persisted
	if _, err := s.store.GetDoc(store.KeySyncState, &p); err != nil {
		return Status{}, err
	}
	count, err := s.store.CountActivities()
	if err != nil {
		return Status{}, err
	}
	st.LastSyncTime, st.Activities = p.LastSyncTime, count
	switch {
	case p.LastSyncTime == nil && count == 0:
		st.State = NotSynced
	case p.LastSyncTime == nil:
		st.State = PartiallySynced
	default:
		st.State = Synced
	}
	return st, nil
}

// Touch marks activities as changed outside a job (eg an edit or delete).
func (s *Syncer) Touch() {
	s.mu.Lock()
	s.revision++
	s.mu.Unlock()
}

func (s *Syncer) setProgress(done, total int) {
	s.mu.Lock()
	s.done, s.total = done, total
	s.revision++
	s.mu.Unlock()
}

// StartSync launches a sync in the background; it's a no-op while one is already running.
func (s *Syncer) StartSync(mode Mode) bool {
	s.mu.Lock()
	if s.syncPending || (s.running && s.job == "sync") {
		s.mu.Unlock()
		return false
	}
	s.syncPending = true
	s.mu.Unlock()
	go s.runJob("sync", func(ctx context.Context) error {
		s.mu.Lock()
		s.syncPending = false
		s.mu.Unlock()
		return s.sync(ctx, mode)
	})
	return true
}

// Stop cancels the running job. An interrupted sync resumes where it left off next time.
func (s *Syncer) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil && s.job == "sync" {
		s.cancel()
	}
}

// RequestRecompute re-derives every activity's stats (after athlete settings or zones change).
// Requests made while a recompute runs collapse into one more pass.
func (s *Syncer) RequestRecompute() {
	s.mu.Lock()
	if s.recomputePending {
		s.mu.Unlock()
		return
	}
	s.recomputePending = true
	s.mu.Unlock()
	go s.runJob("recompute", func(ctx context.Context) error {
		s.mu.Lock()
		s.recomputePending = false
		s.mu.Unlock()
		return s.recompute(ctx)
	})
}

func (s *Syncer) runJob(name string, fn func(ctx context.Context) error) {
	s.jobMu.Lock()
	defer s.jobMu.Unlock()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.mu.Lock()
	s.running, s.job, s.done, s.total, s.cancel = true, name, 0, 0, cancel
	s.lastError = ""
	s.mu.Unlock()

	err := fn(ctx)

	s.mu.Lock()
	s.running, s.job, s.cancel = false, "", nil
	s.revision++
	if err != nil && !errors.Is(err, context.Canceled) {
		s.lastError = err.Error()
		slog.Error("job failed", "job", name, "err", err)
	}
	s.mu.Unlock()
}

func (s *Syncer) context() (*compute.SnapshotResolver, model.UserSettings, error) {
	athlete, err := s.store.Athlete()
	if err != nil {
		return nil, model.UserSettings{}, err
	}
	settings, err := s.store.UserSettings()
	if err != nil {
		return nil, model.UserSettings{}, err
	}
	return compute.NewSnapshotResolver(athlete), settings, nil
}

func (s *Syncer) sync(ctx context.Context, mode Mode) error {
	var p persisted
	if _, err := s.store.GetDoc(store.KeySyncState, &p); err != nil {
		return err
	}
	if mode == Force {
		if err := s.store.ClearActivities(); err != nil {
			return err
		}
		p.LastSyncTime = nil
		if err := s.store.PutDoc(store.KeySyncState, p); err != nil {
			return err
		}
	}
	count, err := s.store.CountActivities()
	if err != nil {
		return err
	}
	var since time.Time
	if mode == Fast && p.LastSyncTime != nil && count > 0 {
		since = p.LastSyncTime.Add(-fastSyncWindow)
	}

	listCtx, cancel := context.WithTimeout(ctx, 2*requestTimeout)
	summaries, err := s.health.ListWorkouts(listCtx, since, listLimit)
	cancel()
	if err != nil {
		return err
	}
	existing, err := s.store.ActivityIDs()
	if err != nil {
		return err
	}
	// Import newest first, so an interrupted sync keeps the most recent activities, and skip
	// what's already stored, so a resumed sync is cheap.
	var todo []mapper.Workout
	for _, w := range slices.Backward(summaries) {
		if w.ID == "" || w.Start == "" || w.End == "" || existing[mapper.ActivityID(&w)] {
			continue
		}
		todo = append(todo, w)
	}
	slog.Info("listed workouts", "listed", len(summaries), "new", len(todo), "since", since)

	resolver, settings, err := s.context()
	if err != nil {
		return err
	}
	s.setProgress(0, len(todo))
	imported := 0
	for i := 0; i < len(todo); i += detailConcurrency {
		if ctx.Err() != nil {
			slog.Info("sync stopped", "imported", imported, "total", len(todo))
			return ctx.Err()
		}
		batch := todo[i:min(i+detailConcurrency, len(todo))]
		built := make([]*builtWorkout, len(batch))
		var wg sync.WaitGroup
		for j := range batch {
			wg.Add(1)
			go func() {
				defer wg.Done()
				built[j] = s.build(ctx, &batch[j], resolver, settings)
			}()
		}
		wg.Wait()
		for _, b := range built {
			if b == nil {
				continue
			}
			if err := s.store.PutActivity(b.activity, b.streams); err != nil {
				return err
			}
			imported++
		}
		s.setProgress(i+len(batch), len(todo))
	}
	now := time.Now().UTC()
	p.LastSyncTime = &now
	slog.Info("sync done", "imported", imported)
	return s.store.PutDoc(store.KeySyncState, p)
}

type builtWorkout struct {
	activity *model.Activity
	streams  *model.Streams
}

func (s *Syncer) build(ctx context.Context, summary *mapper.Workout, resolver *compute.SnapshotResolver, settings model.UserSettings) (b *builtWorkout) {
	defer func() {
		// One malformed workout must not take the whole sync down.
		if r := recover(); r != nil {
			slog.Error("failed to build workout", "id", summary.ID, "panic", r)
			b = nil
		}
	}()
	full := summary
	dctx, cancel := context.WithTimeout(ctx, requestTimeout)
	detail, err := s.health.Workout(dctx, summary.ID)
	cancel()
	if err != nil {
		slog.Warn("workout detail fetch failed; using summary", "id", summary.ID, "err", err)
	} else {
		full = detail
	}
	a, st := mapper.Build(full, resolver, settings, time.Now())
	return &builtWorkout{activity: a, streams: st}
}

// Recompute re-derives one activity from its stored raw streams with the current settings.
func (s *Syncer) Recompute(a *model.Activity) error {
	resolver, settings, err := s.context()
	if err != nil {
		return err
	}
	return s.recomputeOne(a, resolver, settings)
}

func (s *Syncer) recomputeOne(a *model.Activity, resolver *compute.SnapshotResolver, settings model.UserSettings) error {
	raw, err := s.store.Streams(a.ID)
	if err != nil {
		return err
	}
	day := a.StartTime
	if len(day) > 10 {
		day = day[:10]
	}
	mapper.Derive(a, raw, resolver.Resolve(day), settings)
	return s.store.PutActivity(a, nil)
}

func (s *Syncer) recompute(ctx context.Context) error {
	resolver, settings, err := s.context()
	if err != nil {
		return err
	}
	activities, err := s.store.Activities()
	if err != nil {
		return err
	}
	s.setProgress(0, len(activities))
	for i, a := range activities {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := s.recomputeOne(a, resolver, settings); err != nil {
			return err
		}
		if i%20 == 19 {
			s.setProgress(i+1, len(activities))
		}
	}
	s.setProgress(len(activities), len(activities))
	return nil
}
