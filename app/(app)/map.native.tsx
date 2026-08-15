import { AvatarPin } from "@/components/AvatarPin";
import { NavigationPanel } from "@/components/NavigationPanel";
import { Colors, FontSizes, Radii, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { usePresence } from "@/contexts/PresenceContext";
import { useProfiles } from "@/contexts/ProfilesContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLiveFriends } from "@/hooks/use-live-friends";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { getAvatarDisplay } from "@/lib/avatar";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  FOCUSED_MAP_ZOOM,
  MAP_STYLE_URL,
  STALE_LOCATION_MS,
} from "@/lib/maplibre";
import {
  distanceMeters,
  fetchRoute,
  isOffRoute,
  remainingDistance,
  remainingRoute,
  searchPlaces,
  type LatLng,
  type PlaceResult,
  type RouteResult,
} from "@/lib/navigation";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import {
  Camera,
  type CameraRef,
  type LngLatBounds,
  Layer,
  Map as MapLibreMap,
  Marker,
  GeoJSONSource,
} from "@maplibre/maplibre-react-native";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const OFF_ROUTE_METERS = 90;
const RECALC_COOLDOWN_MS = 12000;

export default function MapScreen() {
  const { user, profile } = useAuth();
  const { getProfile } = useProfiles();
  const { isOnline } = usePresence();
  const {
    locations,
    acceptedFriendIdsKey,
    connectionState,
  } = useLiveFriends();
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];
  const { height: tabBarHeight } = useTabBarHeight();

  const [permission, setPermission] = useState<boolean | null>(null);
  const [myLocation, setMyLocation] = useState<{
    latitude: number;
    longitude: number;
    heading: number | null;
  } | null>(null);
  const [myBattery, setMyBattery] = useState<{
    batteryLevel: number | null;
    isCharging: boolean | null;
  }>({ batteryLevel: null, isCharging: null });
  const [tracking, setTracking] = useState(true);

  // ── Navigation state ────────────────────────────────────────
  const [navOpen, setNavOpen] = useState(false);
  const [activeField, setActiveField] = useState<"start" | "dest" | null>(null);
  const [startPlace, setStartPlace] = useState<PlaceResult | null>(null);
  const [destPlace, setDestPlace] = useState<PlaceResult | null>(null);
  const [useGpsStart, setUseGpsStart] = useState(true);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [offlineSearch, setOfflineSearch] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [remainingMeters, setRemainingMeters] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const cameraRef = useRef<CameraRef>(null);
  const hasCenteredRef = useRef(false);
  const trackingRef = useRef(true);
  const userRef = useRef(user);
  const lastWriteRef = useRef(0);
  const lastRecalcRef = useRef(0);
  const routeRef = useRef<RouteResult | null>(null);
  const navigatingRef = useRef(false);
  const destRef = useRef<PlaceResult | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    trackingRef.current = tracking;
  }, [tracking]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  useEffect(() => {
    navigatingRef.current = navigating;
  }, [navigating]);
  useEffect(() => {
    destRef.current = destPlace;
  }, [destPlace]);

  const pushLocation = useCallback(
    async (lat: number, lng: number, heading: number | null, force = false) => {
      const u = userRef.current;
      if (!u || !trackingRef.current) return;

      const now = Date.now();
      if (!force && now - lastWriteRef.current < 5000) return;
      lastWriteRef.current = now;

      let batteryLevel: number | null = null;
      let isCharging: boolean | null = null;

      try {
        const powerState = await Battery.getPowerStateAsync();
        if (powerState?.batteryLevel != null && powerState.batteryLevel >= 0) {
          batteryLevel = Math.round(powerState.batteryLevel * 100);
        }
        isCharging =
          powerState?.batteryState === Battery.BatteryState.CHARGING ||
          powerState?.batteryState === Battery.BatteryState.FULL;
        setMyBattery({ batteryLevel, isCharging });
      } catch {
        setMyBattery({ batteryLevel: null, isCharging: null });
      }

      const { error } = await supabase.from("locations").upsert(
        {
          user_id: u.id,
          latitude: lat,
          longitude: lng,
          heading: heading ?? null,
          battery_level: batteryLevel,
          is_charging: isCharging,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (error) console.warn("Location upsert error:", error.message);
    },
    [],
  );

  // High-accuracy GPS while navigating; balanced otherwise
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        setPermission(status === "granted");
        if (status !== "granted") return;

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (cancelled) return;
        const coords = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          heading: current.coords.heading,
        };
        setMyLocation(coords);
        pushLocation(coords.latitude, coords.longitude, coords.heading, true);

        sub = await Location.watchPositionAsync(
          {
            accuracy: navigating
              ? Location.Accuracy.BestForNavigation
              : Location.Accuracy.High,
            timeInterval: navigating ? 1000 : 3000,
            distanceInterval: navigating ? 5 : 15,
          },
          (pos) => {
            const next = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              heading: pos.coords.heading,
            };
            setMyLocation(next);
            pushLocation(next.latitude, next.longitude, next.heading);

            // Live navigation updates
            if (navigatingRef.current && routeRef.current) {
              const full = routeRef.current.coordinates;
              const here: LatLng = {
                latitude: next.latitude,
                longitude: next.longitude,
              };
              const remaining = remainingRoute(full, here);
              const remM = remainingDistance(remaining);
              setRemainingMeters(remM);
              const total = routeRef.current.distanceMeters || 1;
              const frac = Math.min(1, remM / total);
              setRemainingSeconds(routeRef.current.durationSeconds * frac);

              cameraRef.current?.flyTo({
                center: [next.longitude, next.latitude],
                zoom: 16,
                duration: 800,
              });

              if (destRef.current) {
                const toDest = distanceMeters(here, {
                  latitude: destRef.current.latitude,
                  longitude: destRef.current.longitude,
                });
                if (toDest < 40) {
                  setNavigating(false);
                  Alert.alert("Arrived", "You have reached your destination.");
                  return;
                }
              }

              if (isOffRoute(full, here, OFF_ROUTE_METERS)) {
                const now = Date.now();
                if (now - lastRecalcRef.current > RECALC_COOLDOWN_MS) {
                  lastRecalcRef.current = now;
                  const dest = destRef.current;
                  if (dest) {
                    void (async () => {
                      try {
                        const r = await fetchRoute(here, {
                          latitude: dest.latitude,
                          longitude: dest.longitude,
                        });
                        setRoute(r);
                        setRemainingMeters(r.distanceMeters);
                        setRemainingSeconds(r.durationSeconds);
                      } catch (e) {
                        console.warn("recalc failed", e);
                      }
                    })();
                  }
                }
              }
            }
          },
        );
      } catch (e) {
        console.warn("Location error:", e);
        setPermission(false);
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [pushLocation, navigating]);

  useEffect(() => {
    if (!myLocation || hasCenteredRef.current) return;
    hasCenteredRef.current = true;
    cameraRef.current?.flyTo({
      center: [myLocation.longitude, myLocation.latitude],
      zoom: FOCUSED_MAP_ZOOM,
      duration: 600,
    });
  }, [myLocation]);

  // Debounced place search
  useEffect(() => {
    if (!activeField) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const near = myLocation
        ? { latitude: myLocation.latitude, longitude: myLocation.longitude }
        : undefined;
      const { results, offline } = await searchPlaces(query, near);
      setSearchResults(results);
      setOfflineSearch(offline);
      setSearching(false);
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, activeField, myLocation]);

  // Auto-fetch route when start & dest are set
  useEffect(() => {
    const from: LatLng | null = useGpsStart
      ? myLocation
        ? {
            latitude: myLocation.latitude,
            longitude: myLocation.longitude,
          }
        : null
      : startPlace
        ? {
            latitude: startPlace.latitude,
            longitude: startPlace.longitude,
          }
        : null;
    const to = destPlace
      ? { latitude: destPlace.latitude, longitude: destPlace.longitude }
      : null;
    if (!from || !to || navigating) return;

    let cancelled = false;
    setRouteLoading(true);
    fetchRoute(from, to)
      .then((r) => {
        if (!cancelled) {
          setRoute(r);
          const lngs = r.coordinates.map((p) => p.longitude);
          const lats = r.coordinates.map((p) => p.latitude);
          if (lngs.length && cameraRef.current) {
            const bounds: LngLatBounds = [
              Math.min(...lngs),
              Math.min(...lats),
              Math.max(...lngs),
              Math.max(...lats),
            ];
            cameraRef.current.fitBounds(bounds, {
              padding: { top: 80, right: 80, bottom: 80, left: 80 },
              duration: 700,
            });
          }
        }
      })
      .catch((e) => console.warn("route error", e))
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    useGpsStart,
    startPlace?.id,
    destPlace?.id,
    myLocation?.latitude,
    myLocation?.longitude,
    navigating,
  ]);

  const friendMarkers = useMemo(() => {
    const now = Date.now();
    const ids = acceptedFriendIdsKey
      ? acceptedFriendIdsKey.split(",").filter(Boolean)
      : [];
    return ids
      .map((id) => {
        const loc = locations[id];
        if (!loc) return null;
        const age = now - new Date(loc.updated_at).getTime();
        if (age > STALE_LOCATION_MS) return null;
        return {
          id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          batteryLevel: loc.battery_level,
          isCharging: loc.is_charging,
          profile: getProfile(id),
          online: isOnline(id),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      latitude: number;
      longitude: number;
      batteryLevel: number | null;
      isCharging: boolean | null;
      profile: ReturnType<typeof getProfile>;
      online: boolean;
    }>;
  }, [locations, acceptedFriendIdsKey, getProfile, isOnline]);

  const centerOnMe = useCallback(() => {
    if (!myLocation) {
      Alert.alert("Location", "Waiting for your GPS position…");
      return;
    }
    cameraRef.current?.flyTo({
      center: [myLocation.longitude, myLocation.latitude],
      zoom: FOCUSED_MAP_ZOOM,
      duration: 500,
    });
  }, [myLocation]);

  const fitAll = useCallback(() => {
    const pts: [number, number][] = [
      ...(myLocation
        ? [[myLocation.longitude, myLocation.latitude] as [number, number]]
        : []),
      ...friendMarkers.map(
        (f) => [f.longitude, f.latitude] as [number, number],
      ),
    ];
    if (pts.length < 1) return;
    if (pts.length === 1) {
      cameraRef.current?.flyTo({
        center: pts[0],
        zoom: FOCUSED_MAP_ZOOM,
        duration: 500,
      });
      return;
    }
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    const bounds: LngLatBounds = [
      Math.min(...lngs),
      Math.min(...lats),
      Math.max(...lngs),
      Math.max(...lats),
    ];
    cameraRef.current?.fitBounds(bounds, {
      padding: { top: 60, right: 60, bottom: 60, left: 60 },
      duration: 600,
    });
  }, [friendMarkers, myLocation]);

  const toggleTracking = useCallback(() => {
    setTracking((prev) => {
      const next = !prev;
      if (next && myLocation) {
        pushLocation(
          myLocation.latitude,
          myLocation.longitude,
          myLocation.heading,
          true,
        );
      }
      return next;
    });
  }, [myLocation, pushLocation]);

  const startLabel = useGpsStart
    ? "My current location"
    : startPlace?.name ?? "";
  const destLabel = destPlace?.name ?? "";

  const onPickResult = (place: PlaceResult) => {
    if (activeField === "start") {
      setStartPlace(place);
      setUseGpsStart(false);
    } else if (activeField === "dest") {
      setDestPlace(place);
    }
    setActiveField(null);
    setQuery("");
    setSearchResults([]);
  };

  const onStartNavigation = () => {
    if (!route || !destPlace) return;
    if (!myLocation) {
      Alert.alert("GPS", "Waiting for your position…");
      return;
    }
    setNavigating(true);
    setRemainingMeters(route.distanceMeters);
    setRemainingSeconds(route.durationSeconds);
    cameraRef.current?.flyTo({
      center: [myLocation.longitude, myLocation.latitude],
      zoom: 16,
      duration: 500,
    });
  };

  const onStopNavigation = () => {
    setNavigating(false);
    setRemainingMeters(null);
    setRemainingSeconds(null);
  };

  // Live polyline: remaining segment while navigating, full route otherwise
  const routeGeoJson = useMemo(() => {
    if (!route || route.coordinates.length < 2) return null;
    let coords = route.coordinates;
    if (navigating && myLocation) {
      coords = remainingRoute(route.coordinates, {
        latitude: myLocation.latitude,
        longitude: myLocation.longitude,
      });
    }
    return {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: coords.map((p) => [p.longitude, p.latitude]),
      },
    };
  }, [route, navigating, myLocation]);
    if (permission === null) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={{ color: c.textSecondary, marginTop: Spacing.md }}>
          Getting location…
        </Text>
      </View>
    );
  }

  if (permission === false) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]}>
        <Ionicons name="location-outline" size={48} color={c.icon} />
        <Text style={[styles.permTitle, { color: c.text }]}>
          Location permission needed
        </Text>
        <Text style={[styles.permSub, { color: c.textSecondary }]}>
          Enable location access in your device settings so we can show your
          position on the map and navigate.
        </Text>
      </SafeAreaView>
    );
  }

  const me = getAvatarDisplay(profile, "#2563EB");
  const panelBottom = tabBarHeight + Spacing.sm;

  return (
    <View style={styles.flex}>
      <MapLibreMap style={styles.flex} mapStyle={MAP_STYLE_URL} logo={false}>
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: myLocation
              ? [myLocation.longitude, myLocation.latitude]
              : DEFAULT_MAP_CENTER,
            zoom: myLocation ? FOCUSED_MAP_ZOOM : DEFAULT_MAP_ZOOM,
          }}
        />

        {routeGeoJson && (
          <GeoJSONSource id="nav-route" data={routeGeoJson}>
            <Layer
              id="nav-route-line"
              type="line"
              paint={{
                "line-color": c.primary,
                "line-width": 5,
                "line-opacity": 0.9,
              }}
              layout={{
                "line-cap": "round",
                "line-join": "round",
              }}
            />
          </GeoJSONSource>
        )}

        {myLocation && (
          <Marker
            id="me"
            lngLat={[myLocation.longitude, myLocation.latitude]}
            anchor="bottom"
          >
            <AvatarPin
              initial={me.initial}
              color={me.color}
              imageUri={me.imageUri}
              batteryLevel={myBattery.batteryLevel}
              isCharging={myBattery.isCharging}
            />
          </Marker>
        )}

        {destPlace && (
          <Marker
            id="dest"
            lngLat={[destPlace.longitude, destPlace.latitude]}
            anchor="bottom"
          >
            <View style={[styles.destPin, { backgroundColor: c.primary }]}>
              <Ionicons name="flag" size={16} color="#fff" />
            </View>
          </Marker>
        )}

        {!useGpsStart && startPlace && (
          <Marker
            id="start"
            lngLat={[startPlace.longitude, startPlace.latitude]}
            anchor="bottom"
          >
            <View style={[styles.destPin, { backgroundColor: c.success }]}>
              <Ionicons name="play" size={14} color="#fff" />
            </View>
          </Marker>
        )}

        {friendMarkers.map((f) => {
          const display = getAvatarDisplay(f.profile, "#10B981");
          return (
            <Marker
              key={f.id}
              id={f.id}
              lngLat={[f.longitude, f.latitude]}
              anchor="bottom"
            >
              <AvatarPin
                initial={display.initial}
                color={display.color}
                imageUri={display.imageUri}
                batteryLevel={f.batteryLevel}
                isCharging={f.isCharging}
                faded={!f.online}
              />
            </Marker>
          );
        })}
      </MapLibreMap>

      <SafeAreaView style={styles.topBar} edges={["top"]}>
        <View style={[styles.badge, { backgroundColor: c.surface }]}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: navigating
                  ? c.primary
                  : connectionState === "reconnecting"
                    ? c.error
                    : tracking
                      ? c.success
                      : c.icon,
              },
            ]}
          />
          <Text style={[styles.badgeText, { color: c.text }]}>
            {navigating
              ? "Navigating"
              : connectionState === "reconnecting"
                ? "Reconnecting…"
                : tracking
                  ? "Sharing live"
                  : "Paused"}
          </Text>
          {routeLoading && (
            <ActivityIndicator size="small" color={c.primary} />
          )}
        </View>
      </SafeAreaView>

      {navOpen && (
        <NavigationPanel
          startLabel={startLabel}
          destLabel={destLabel}
          activeField={activeField}
          onFocusField={(f) => {
            setActiveField(f);
            setQuery("");
            setSearchResults([]);
          }}
          query={query}
          onChangeQuery={setQuery}
          results={searchResults}
          searching={searching}
          offlineSearch={offlineSearch}
          onPickResult={onPickResult}
          onUseMyLocationAsStart={() => {
            setUseGpsStart(true);
            setStartPlace(null);
            setActiveField(null);
            setQuery("");
          }}
          onStartNavigation={onStartNavigation}
          onStopNavigation={onStopNavigation}
          navigating={navigating}
          route={route}
          remainingMeters={remainingMeters}
          remainingSeconds={remainingSeconds}
          canNavigate={!!route && !!destPlace && !routeLoading}
          bottomOffset={panelBottom}
        />
      )}

      <View
        style={[
          styles.fabs,
          {
            bottom: navOpen
              ? panelBottom + (navigating ? 120 : 220)
              : tabBarHeight + Spacing.lg,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            setNavOpen((v) => !v);
            if (navOpen) {
              setNavigating(false);
              setActiveField(null);
            }
          }}
          style={[
            styles.fab,
            { backgroundColor: navOpen ? c.primary : c.surface },
          ]}
        >
          <Ionicons
            name={navOpen ? "map" : "navigate"}
            size={22}
            color={navOpen ? "#fff" : c.primary}
          />
        </Pressable>

        <Pressable
          onPress={toggleTracking}
          style={[
            styles.fab,
            { backgroundColor: tracking ? c.success : c.surface },
          ]}
        >
          <Ionicons
            name={tracking ? "radio" : "radio-outline"}
            size={22}
            color={tracking ? "#fff" : c.text}
          />
        </Pressable>

        <Pressable
          onPress={fitAll}
          style={[styles.fab, { backgroundColor: c.surface }]}
        >
          <Ionicons name="people" size={22} color={c.primary} />
        </Pressable>

        <Pressable
          onPress={centerOnMe}
          style={[styles.fab, { backgroundColor: c.surface }]}
        >
          <Ionicons name="locate" size={22} color={c.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xxxl,
  },
  permTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  permSub: {
    fontSize: FontSizes.sm,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.full,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  fabs: {
    position: "absolute",
    right: Spacing.lg,
    gap: Spacing.sm,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  destPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
});