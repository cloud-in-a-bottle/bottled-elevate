# ---- Stage 1: build the SolidJS frontend ----
FROM node:22-bookworm-slim AS web
WORKDIR /build/web
# Dependency layer: cached unless the manifests change.
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
# Output: /build/web/dist

# ---- Stage 2: build the Go backend ----
FROM golang:1.26-bookworm AS server
WORKDIR /build/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# Pure-Go sqlite driver, so a static binary needs no cgo.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/elevate ./cmd/elevate

# ---- Stage 3: runtime ----
FROM gcr.io/distroless/static-debian12
COPY --from=server /out/elevate /app/elevate
COPY --from=web /build/web/dist /app/static
ENV ELEVATE_STATIC_DIR=/app/static
EXPOSE 8080
ENTRYPOINT ["/app/elevate"]
