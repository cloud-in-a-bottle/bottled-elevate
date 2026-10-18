import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createEffect, onCleanup, onMount } from "solid-js";
import { theme } from "../lib/theme";

export interface MapTrack {
  latlng: [number, number][];
  color: string;
  label?: string;
}

export interface MapViewProps {
  tracks: MapTrack[];
  /** Highlight a range of indexes [start, end] on the first track (eg a selected split). */
  highlight?: [number, number] | null;
  /** Show a marker at this index of the first track (eg the graph's hover position). */
  cursorIndex?: number | null;
  class?: string;
  style?: string;
}

// OpenStreetMap's standard tiles: free, no key, fine for a single user's light use. Dark mode
// recolors them with a CSS filter (see .map-dark in styles.css).
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Leaflet map of one or more GPS tracks. Needs no API token (OSM data, CARTO tiles). */
export default function MapView(props: MapViewProps) {
  let el!: HTMLDivElement;
  let map: L.Map;
  let trackLayer = L.layerGroup();
  let highlightLayer = L.layerGroup();
  let cursor: L.CircleMarker | undefined;

  onMount(() => {
    map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    trackLayer.addTo(map);
    highlightLayer.addTo(map);
    el.addEventListener("click", () => map.scrollWheelZoom.enable(), { once: true });

    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19, className: "map-tiles" }).addTo(map);
    createEffect(() => el.classList.toggle("map-dark", theme() === "dark"));

    createEffect(() => {
      trackLayer.clearLayers();
      const bounds = L.latLngBounds([]);
      for (const t of props.tracks) {
        if (!t.latlng.length) continue;
        const line = L.polyline(t.latlng, { color: t.color, weight: 3, opacity: 0.9 });
        if (t.label) line.bindTooltip(t.label, { sticky: true });
        line.addTo(trackLayer);
        bounds.extend(line.getBounds());
        L.circleMarker(t.latlng[0], { radius: 5, color: "#fff", weight: 2, fillColor: "#2ecc71", fillOpacity: 1 }).addTo(trackLayer);
        L.circleMarker(t.latlng[t.latlng.length - 1], { radius: 5, color: "#fff", weight: 2, fillColor: "#e74c3c", fillOpacity: 1 }).addTo(trackLayer);
      }
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    });

    createEffect(() => {
      highlightLayer.clearLayers();
      const h = props.highlight;
      const track = props.tracks[0]?.latlng;
      if (!h || !track?.length) return;
      const seg = track.slice(Math.max(0, h[0]), Math.min(track.length, h[1] + 1));
      if (seg.length > 1) {
        const line = L.polyline(seg, { color: "#ffd740", weight: 6, opacity: 1 }).addTo(highlightLayer);
        map.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 16 });
      }
    });

    createEffect(() => {
      const i = props.cursorIndex;
      const track = props.tracks[0]?.latlng;
      if (i === null || i === undefined || !track?.[i]) {
        cursor?.remove();
        cursor = undefined;
        return;
      }
      if (!cursor) {
        cursor = L.circleMarker(track[i], { radius: 6, color: "#000", weight: 2, fillColor: "#ffd740", fillOpacity: 1 }).addTo(map);
      } else {
        cursor.setLatLng(track[i]);
      }
    });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    onCleanup(() => {
      ro.disconnect();
      map.remove();
    });
  });

  return <div ref={el} class={props.class} style={props.style ?? "width:100%;height:400px;border-radius:var(--radius)"} />;
}
