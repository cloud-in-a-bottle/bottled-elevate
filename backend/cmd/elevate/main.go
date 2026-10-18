// Command elevate serves the Elevate fitness-analytics app on Cloud in a Bottle: it syncs workouts
// from the health-data service, computes activity stats, and serves the API and SolidJS frontend.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/api"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/config"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/health"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/store"
	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/syncer"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	st, err := store.Open(cfg.SQLitePath)
	if err != nil {
		return err
	}
	defer st.Close()

	hc := &health.Client{
		RouterURL: cfg.RouterURL, AppToken: cfg.AppToken, Shortname: cfg.HealthShortname,
		HTTP: &http.Client{Timeout: 60 * time.Second},
	}
	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           (&api.Server{Store: st, Syncer: syncer.New(st, hc), StaticDir: cfg.StaticDir}).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	slog.Info("listening", "addr", cfg.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
