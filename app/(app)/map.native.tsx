import { AvatarPin } from "@/components/AvatarPin";
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
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import {
  Camera,
  type CameraRef,
  type LngLatBounds,
  Map as MapLibreMap,
  Marker,
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

export default function MapScreen() {
  const { user, profile } = useAuth();
  const { getProfile } = useProfiles();
  const { isOnline } = usePresence();
  const {
    locations,
    acceptedFriendIds,
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

  const cameraRef = useRef<CameraRef>(null);
  const hasCenteredRef = useRef(false);
  const trackingRef = useRef(true);
  const userRef = useRef(user);
  const lastWriteRef = useRef(0);

  useEffect(() => {
    trackingRef.current = tracking;
  }, [tracking]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

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
        // Battery info can be genuinely unavailable on some devices/emulators
        // — leave it null rather than showing a stale or fabricated value.
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

  useEffect(() => {
    if (!myLocation || hasCenteredRef.current) return;
    hasCenteredRef.current = true;
    cameraRef.current?.flyTo({
      center: [myLocation.longitude, myLocation.latitude],
      zoom: FOCUSED_MAP_ZOOM,
      duration: 800,
    });
  }, [myLocation]);

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
          accuracy: Location.Accuracy.Balanced,
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
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            distanceInterval: 5,
          },
          (loc) => {
            const next = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              heading: loc.coords.heading,
            };
            setMyLocation(next);
            pushLocation(next.latitude, next.longitude, next.heading);
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
  }, [pushLocation]);

  // Fetch missing friend profiles as soon as we know who they are — keeps
  // avatars/usernames on the map in sync with the shared realtime cache.
  const { ensureLoaded } = useProfiles();
  useEffect(() => {
    if (!acceptedFriendIdsKey) return;
    void ensureLoaded(acceptedFriendIdsKey.split(","));
  }, [acceptedFriendIdsKey, ensureLoaded]);

  const friendMarkers = useMemo(() => {
    const now = Date.now();
    return acceptedFriendIds
      .map((id) => {
        const loc = locations[id];
        if (!loc) return null;
        const stale =
          now - new Date(loc.updated_at).getTime() > STALE_LOCATION_MS;
        if (stale) return null;
        const friendProfile = getProfile(id);
        return {
          id,
          latitude: Number(loc.latitude),
          longitude: Number(loc.longitude),
          batteryLevel: loc.battery_level,
          isCharging: loc.is_charging,
          profile: friendProfile,
          online: isOnline(id),
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }, [acceptedFriendIds, locations, getProfile, isOnline]);

  const centerOnMe = useCallback(() => {
    if (!myLocation) {
      Alert.alert("Location", "Waiting for your GPS position…");
      return;
    }
    cameraRef.current?.flyTo({
      center: [myLocation.longitude, myLocation.latitude],
      zoom: FOCUSED_MAP_ZOOM,
      duration: 600,
    });
  }, [myLocation]);

  const fitAll = useCallback(() => {
    const points: [number, number][] = [
      ...(myLocation
        ? [[myLocation.longitude, myLocation.latitude] as [number, number]]
        : []),
      ...friendMarkers.map(
        (f) => [f.longitude, f.latitude] as [number, number],
      ),
    ];

    if (points.length === 0) {
      Alert.alert("Map", "No locations to show yet.");
      return;
    }

    if (points.length === 1) {
      cameraRef.current?.flyTo({
        center: points[0],
        zoom: FOCUSED_MAP_ZOOM,
        duration: 600,
      });
      return;
    }

    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const bounds: LngLatBounds = [
      Math.min(...lngs),
      Math.min(...lats),
      Math.max(...lngs),
      Math.max(...lats),
    ];
    cameraRef.current?.fitBounds(bounds, {
      padding: { top: 80, right: 80, bottom: 80, left: 80 },
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
          position on the map.
        </Text>
      </SafeAreaView>
    );
  }

  const me = getAvatarDisplay(profile, "#2563EB");

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
                backgroundColor:
                  connectionState === "reconnecting"
                    ? c.error
                    : tracking
                      ? c.success
                      : c.icon,
              },
            ]}
          />
          <Text style={[styles.badgeText, { color: c.text }]}>
            {connectionState === "reconnecting"
              ? "Reconnecting…"
              : tracking
                ? "Sharing live"
                : "Paused"}
          </Text>
          {friendMarkers.length > 0 && (
            <Text style={[styles.badgeMeta, { color: c.textSecondary }]}>
              · {friendMarkers.length} friend
              {friendMarkers.length !== 1 ? "s" : ""}
            </Text>
          )}
        </View>
      </SafeAreaView>

      <View style={[styles.fabs, { bottom: tabBarHeight + Spacing.lg }]}>
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
  badgeMeta: {
    fontSize: FontSizes.xs,
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
});