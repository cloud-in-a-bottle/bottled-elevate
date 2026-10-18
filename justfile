default: test

# Install frontend deps.
setup:
    cd web && npm ci

# Run against synthetic data: mock health service on :9090, backend on :8080 serving web/dist.
# Rebuild the frontend with `just build-web`, or run `just dev-web` for hot reload on :5173.
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p local-data
    (cd backend && go run ./cmd/devhealth -addr :9090) &
    trap 'kill %1' EXIT
    cd backend && OPENHOST_SQLITE_MAIN={{justfile_directory()}}/local-data/main.db \
      OPENHOST_ROUTER_URL=http://localhost:9090 OPENHOST_APP_TOKEN=dev \
      ELEVATE_STATIC_DIR={{justfile_directory()}}/web/dist go run ./cmd/elevate

# Vite dev server with hot reload (proxies /api to the backend on :8080).
dev-web:
    cd web && npx vite

build-web:
    cd web && npm run build

# Backend + frontend unit tests and type-check.
test:
    cd backend && go test ./...
    cd web && npx tsc --noEmit && npx vitest run

check:
    cd backend && gofmt -l . && go vet ./...
    cd web && npx tsc --noEmit

# OpenHost integration test (deploys the app + a mock provider; needs podman).
integration:
    env $(env | grep -oE '^(OPENHOST|BOTTLE)_[A-Z_]+' | sed 's/^/-u /') uv run pytest tests
