/**
 * Hybrid online/offline navigation helpers.
 *
 * Online: Nominatim (search) + OSRM (driving routes) — free, no API key.
 * Offline: GPS always works; recent searches & last route are cached;
 *          if no cache, a straight-line fallback is shown with a clear label.
 *
 * True full offline OSM routing (Valhalla/OSRM graph on-device) would require
 * multi-GB map packs and native modules outside Expo's default scope.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

export type LatLng = { latitude: number; longitude: number };

export type PlaceResult = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export type RouteResult = {
  coordinates: LatLng[]; // [start ... end]
  distanceMeters: number;
  durationSeconds: number;
  source: "osrm" | "cache" | "straight";
};

const SEARCH_CACHE_KEY = "@nav/search_cache_v1";
const ROUTE_CACHE_KEY = "@nav/route_cache_v1";
const MAX_SEARCH_CACHE = 40;

/** Haversine distance in meters */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Bearing degrees 0–360 from a → b */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} h ${rm} min` : `${h} h`;
}

export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return !!(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return false;
  }
}

// ── Search cache ──────────────────────────────────────────────

async function loadSearchCache(): Promise<PlaceResult[]> {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PlaceResult[];
  } catch {
    return [];
  }
}

async function saveSearchCache(places: PlaceResult[]) {
  try {
    await AsyncStorage.setItem(
      SEARCH_CACHE_KEY,
      JSON.stringify(places.slice(0, MAX_SEARCH_CACHE)),
    );
  } catch {}
}

export async function rememberPlace(place: PlaceResult) {
  const list = await loadSearchCache();
  const next = [place, ...list.filter((p) => p.id !== place.id)].slice(
    0,
    MAX_SEARCH_CACHE,
  );
  await saveSearchCache(next);
}

/** Search places: online Nominatim, offline fuzzy match on cache. */
export async function searchPlaces(
  query: string,
  near?: LatLng,
): Promise<{ results: PlaceResult[]; offline: boolean }> {
  const q = query.trim();
  if (q.length < 2) return { results: [], offline: false };

  const online = await isOnline();
  if (online) {
    try {
      const params = new URLSearchParams({
        q,
        format: "json",
        addressdetails: "0",
        limit: "8",
      });
      if (near) {
        const viewbox = [
          near.longitude - 0.5,
          near.latitude + 0.5,
          near.longitude + 0.5,
          near.latitude - 0.5,
        ].join(",");
        params.set("viewbox", viewbox);
        params.set("bounded", "0");
      }
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
          headers: {
            "User-Agent": "ComTrackRealtimeLocation/1.1",
            Accept: "application/json",
          },
        },
      );
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const data = (await res.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
      }>;
      const results: PlaceResult[] = data.map((row) => ({
        id: String(row.place_id),
        name: row.display_name.split(",")[0]?.trim() || row.display_name,
        address: row.display_name,
        latitude: parseFloat(row.lat),
        longitude: parseFloat(row.lon),
      }));
      for (const p of results) await rememberPlace(p);
      return { results, offline: false };
    } catch (e) {
      console.warn("[nav] search online failed, falling back to cache", e);
    }
  }

  const cache = await loadSearchCache();
  const lq = q.toLowerCase();
  const results = cache
    .filter(
      (p) =>
        p.name.toLowerCase().includes(lq) ||
        p.address.toLowerCase().includes(lq),
    )
    .slice(0, 8);
  return { results, offline: true };
}

// ── Routing ───────────────────────────────────────────────────

type CachedRoute = {
  key: string;
  route: RouteResult;
  savedAt: number;
};

function routeCacheKey(from: LatLng, to: LatLng): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(from.latitude)},${r(from.longitude)}->${r(to.latitude)},${r(to.longitude)}`;
}

async function loadRouteCache(): Promise<CachedRoute[]> {
  try {
    const raw = await AsyncStorage.getItem(ROUTE_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CachedRoute[];
  } catch {
    return [];
  }
}

async function saveRouteToCache(from: LatLng, to: LatLng, route: RouteResult) {
  try {
    const list = await loadRouteCache();
    const key = routeCacheKey(from, to);
    const next = [
      { key, route, savedAt: Date.now() },
      ...list.filter((x) => x.key !== key),
    ].slice(0, 20);
    await AsyncStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(next));
  } catch {}
}

function straightLineRoute(from: LatLng, to: LatLng): RouteResult {
  const dist = distanceMeters(from, to);
  const durationSeconds = (dist / 1000 / 30) * 3600;
  return {
    coordinates: [from, to],
    distanceMeters: dist,
    durationSeconds,
    source: "straight",
  };
}

/** Fetch driving route: OSRM online → cache → straight-line offline. */
export async function fetchRoute(
  from: LatLng,
  to: LatLng,
): Promise<RouteResult> {
  const key = routeCacheKey(from, to);
  const online = await isOnline();

  if (online) {
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
        `?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const json = await res.json();
      const route0 = json.routes?.[0];
      if (!route0) throw new Error("No route");
      const coords: LatLng[] = (
        route0.geometry.coordinates as [number, number][]
      ).map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
      const result: RouteResult = {
        coordinates: coords,
        distanceMeters: route0.distance,
        durationSeconds: route0.duration,
        source: "osrm",
      };
      await saveRouteToCache(from, to, result);
      return result;
    } catch (e) {
      console.warn("[nav] OSRM failed, trying cache", e);
    }
  }

  const cache = await loadRouteCache();
  const hit = cache.find((c) => c.key === key);
  if (hit) {
    return { ...hit.route, source: "cache" };
  }

  return straightLineRoute(from, to);
}

export function remainingRoute(
  full: LatLng[],
  here: LatLng,
  passThresholdM = 35,
): LatLng[] {
  if (full.length < 2) return full;
  let nearest = 0;
  let best = Infinity;
  for (let i = 0; i < full.length; i++) {
    const d = distanceMeters(here, full[i]);
    if (d < best) {
      best = d;
      nearest = i;
    }
  }
  let idx = nearest;
  while (
    idx < full.length - 1 &&
    distanceMeters(here, full[idx]) < passThresholdM
  ) {
    idx++;
  }
  return [here, ...full.slice(idx)];
}

export function isOffRoute(
  full: LatLng[],
  here: LatLng,
  maxM = 80,
): boolean {
  if (full.length === 0) return false;
  let best = Infinity;
  for (const p of full) {
    const d = distanceMeters(here, p);
    if (d < best) best = d;
  }
  return best > maxM;
}

export function remainingDistance(path: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    sum += distanceMeters(path[i - 1], path[i]);
  }
  return sum;
}