package config

import (
	"fmt"
	"os"
)

type Config struct {
	StaticDir       string
	SQLitePath      string
	RouterURL       string
	AppToken        string
	HealthShortname string
	Addr            string
}

func getenv(name, def string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return def
}

func Load() (Config, error) {
	c := Config{
		StaticDir:       getenv("ELEVATE_STATIC_DIR", "/app/static"),
		SQLitePath:      os.Getenv("OPENHOST_SQLITE_MAIN"),
		RouterURL:       os.Getenv("OPENHOST_ROUTER_URL"),
		AppToken:        os.Getenv("OPENHOST_APP_TOKEN"),
		HealthShortname: getenv("ELEVATE_HEALTH_SHORTNAME", "health"),
		Addr:            getenv("ELEVATE_ADDR", ":8080"),
	}
	for name, v := range map[string]string{
		"OPENHOST_SQLITE_MAIN": c.SQLitePath, "OPENHOST_ROUTER_URL": c.RouterURL, "OPENHOST_APP_TOKEN": c.AppToken,
	} {
		if v == "" {
			return c, fmt.Errorf("required environment variable %s is not set", name)
		}
	}
	return c, nil
}
