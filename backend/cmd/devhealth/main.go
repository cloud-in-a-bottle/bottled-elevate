// Command devhealth is a stand-in for the Cloud in a Bottle router + a health-data provider, for
// local development. It serves ~18 months of synthetic workouts at the router paths the backend calls.
//
//	go run ./cmd/devhealth -addr :9090
//	OPENHOST_ROUTER_URL=http://localhost:9090 OPENHOST_APP_TOKEN=dev OPENHOST_SQLITE_MAIN=/tmp/e.db go run ./cmd/elevate
package main

import (
	"flag"
	"log"
	"net/http"
	"time"

	"github.com/cloud-in-a-bottle/bottled-elevate/backend/internal/devdata"
)

func main() {
	addr := flag.String("addr", ":9090", "listen address")
	months := flag.Int("months", 18, "months of history to generate")
	flag.Parse()
	workouts := devdata.Build(time.Now().UTC().Truncate(24*time.Hour), *months)
	log.Printf("serving %d synthetic workouts on %s", len(workouts), *addr)
	log.Fatal(http.ListenAndServe(*addr, devdata.Handler(workouts)))
}
