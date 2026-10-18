// Theme-aware colors (kept apart from sensors.ts so the definitions stay DOM-free and testable).
import { cssVar, theme } from "../../../lib/theme";
import type { Sensor } from "./sensors";

/** Resolve a sensor's color for the current theme (reactive on theme). */
export function sensorColor(s: Sensor): string {
  theme();
  return cssVar(s.colorVar) || "#888";
}

/** "#rrggbb" + alpha -> rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}
