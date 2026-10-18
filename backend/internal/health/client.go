// Package health reads workouts from the Cloud in a Bottle health-data service.
package health

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/mapper"
)

const ServiceURL = "github.com/imbue-openhost/health-data-service-spec"

var ErrNotFound = errors.New("workout not found")

type Client struct {
	RouterURL string
	AppToken  string
	Shortname string
	HTTP      *http.Client
}

func (c *Client) serviceBase() string {
	return strings.TrimRight(c.RouterURL, "/") + "/api/services/v2/call/" + c.Shortname
}

func (c *Client) get(ctx context.Context, rawURL, provider string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.AppToken)
	if provider != "" {
		req.Header.Set("X-OpenHost-Provider", provider)
	}
	return c.HTTP.Do(req)
}

// Providers lists the app ids of every running provider. A plain service call only reaches the
// owner's default provider, so with several installed (eg apple-health + oura) the rest would
// never be read; workout reads fan out to all of them instead.
func (c *Client) Providers(ctx context.Context) []string {
	u := strings.TrimRight(c.RouterURL, "/") + "/api/services/v2/providers?service=" + url.QueryEscape(ServiceURL)
	resp, err := c.get(ctx, u, "")
	if err != nil {
		slog.Warn("health provider discovery failed", "err", err)
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		slog.Warn("health provider discovery failed", "status", resp.StatusCode)
		return nil
	}
	body, _ := io.ReadAll(resp.Body)
	type provider struct {
		AppID  string `json:"app_id"`
		Status string `json:"status"`
	}
	var list []provider
	if err := json.Unmarshal(body, &list); err != nil {
		// Older routers wrapped the list as {"providers": [...]}.
		var wrapped struct {
			Providers []provider `json:"providers"`
		}
		if err := json.Unmarshal(body, &wrapped); err != nil {
			return nil
		}
		list = wrapped.Providers
	}
	var ids []string
	for _, p := range list {
		if p.Status == "running" {
			ids = append(ids, p.AppID)
		}
	}
	return ids
}

type result struct {
	status int
	body   []byte
	err    error
}

// fanOut GETs path from every provider in parallel ("" provider = the default one).
func (c *Client) fanOut(ctx context.Context, providers []string, path string) []result {
	if len(providers) == 0 {
		providers = []string{""}
	}
	out := make([]result, len(providers))
	var wg sync.WaitGroup
	for i, p := range providers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, err := c.get(ctx, c.serviceBase()+path, p)
			if err != nil {
				out[i] = result{err: err}
				return
			}
			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			out[i] = result{status: resp.StatusCode, body: body, err: err}
		}()
	}
	wg.Wait()
	return out
}

// ListWorkouts returns summaries from every provider, oldest first. since may be zero.
func (c *Client) ListWorkouts(ctx context.Context, since time.Time, limit int) ([]mapper.Workout, error) {
	q := url.Values{"limit": {fmt.Sprint(limit)}}
	if !since.IsZero() {
		q.Set("start", since.UTC().Format(time.RFC3339))
	}
	providers := c.Providers(ctx)
	results := c.fanOut(ctx, providers, "/v1/workouts?"+q.Encode())
	var merged []mapper.Workout
	ok := 0
	for i, r := range results {
		if r.err != nil || r.status != http.StatusOK {
			slog.Warn("health provider failed to list workouts", "provider", providerName(providers, i), "status", r.status, "err", r.err)
			continue
		}
		var page struct {
			Data []mapper.Workout `json:"data"`
		}
		if err := json.Unmarshal(r.body, &page); err != nil {
			slog.Warn("health provider returned bad workouts", "provider", providerName(providers, i), "err", err)
			continue
		}
		ok++
		merged = append(merged, page.Data...)
	}
	if ok == 0 {
		return nil, errors.New("no health-data provider answered")
	}
	sort.SliceStable(merged, func(i, j int) bool {
		a, _ := mapper.ParseTime(merged[i].Start)
		b, _ := mapper.ParseTime(merged[j].Start)
		return a.Before(b)
	})
	return merged, nil
}

func providerName(providers []string, i int) string {
	if i < len(providers) {
		return providers[i]
	}
	return "default"
}

// Workout fetches one workout's full detail. Workout ids are provider-unique, so the provider that
// has it answers 200 and the rest 404.
func (c *Client) Workout(ctx context.Context, id string) (*mapper.Workout, error) {
	results := c.fanOut(ctx, c.Providers(ctx), "/v1/workouts/"+url.PathEscape(id))
	allNotFound := true
	for _, r := range results {
		if r.err == nil && r.status == http.StatusOK {
			var w mapper.Workout
			if err := json.Unmarshal(r.body, &w); err != nil {
				return nil, err
			}
			return &w, nil
		}
		if r.err != nil || r.status != http.StatusNotFound {
			allNotFound = false
		}
	}
	if allNotFound {
		return nil, ErrNotFound
	}
	return nil, errors.New("no health-data provider answered")
}
