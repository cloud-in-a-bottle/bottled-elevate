// Per-browser UI conveniences (last viewed period, toggles). Never required for correctness.
export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`elevate.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(`elevate.${key}`, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
}
