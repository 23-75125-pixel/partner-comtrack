/**
 * MapLibre style configuration.
 *
 * MapLibre is style-URL driven (unlike the old Leaflet/OSM raster setup).
 * By default this points at OpenFreeMap's "liberty" style — a free, open,
 * unlimited-usage vector style that requires no API key, which makes the
 * app work out of the box. For production you can swap in your own style
 * (e.g. from MapTiler, Stadia Maps, or a self-hosted tileserver) by setting
 * EXPO_PUBLIC_MAPLIBRE_STYLE_URL in your .env file — no code changes needed.
 */
export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAPLIBRE_STYLE_URL?.trim() || DEFAULT_MAP_STYLE_URL;

/** Manila, as a sane default center before we know the user's location. */
export const DEFAULT_MAP_CENTER: [number, number] = [120.9842, 14.5995];
export const DEFAULT_MAP_ZOOM = 12;
export const FOCUSED_MAP_ZOOM = 15;

/** A friend's location older than this is treated as stale and hidden from the map. */
export const STALE_LOCATION_MS = 10 * 60 * 1000; // 10 minutes
