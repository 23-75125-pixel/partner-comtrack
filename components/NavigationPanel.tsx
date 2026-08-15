import { Colors, FontSizes, Radii, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  formatDistance,
  formatDuration,
  type PlaceResult,
  type RouteResult,
} from "@/lib/navigation";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  startLabel: string;
  destLabel: string;
  activeField: "start" | "dest" | null;
  onFocusField: (field: "start" | "dest") => void;
  query: string;
  onChangeQuery: (q: string) => void;
  results: PlaceResult[];
  searching: boolean;
  offlineSearch: boolean;
  onPickResult: (place: PlaceResult) => void;
  onUseMyLocationAsStart: () => void;
  onStartNavigation: () => void;
  onStopNavigation: () => void;
  navigating: boolean;
  route: RouteResult | null;
  remainingMeters: number | null;
  remainingSeconds: number | null;
  canNavigate: boolean;
  bottomOffset: number;
};

export function NavigationPanel({
  startLabel,
  destLabel,
  activeField,
  onFocusField,
  query,
  onChangeQuery,
  results,
  searching,
  offlineSearch,
  onPickResult,
  onUseMyLocationAsStart,
  onStartNavigation,
  onStopNavigation,
  navigating,
  route,
  remainingMeters,
  remainingSeconds,
  canNavigate,
  bottomOffset,
}: Props) {
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];

  if (navigating) {
    const dist =
      remainingMeters != null
        ? formatDistance(remainingMeters)
        : route
          ? formatDistance(route.distanceMeters)
          : "—";
    const eta =
      remainingSeconds != null
        ? formatDuration(remainingSeconds)
        : route
          ? formatDuration(route.durationSeconds)
          : "—";
    const sourceLabel =
      route?.source === "osrm"
        ? "Live route"
        : route?.source === "cache"
          ? "Cached route"
          : "Direct line";

    return (
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
            bottom: bottomOffset,
          },
        ]}
      >
        <View style={styles.navRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.navEta, { color: c.primary }]}>{eta}</Text>
            <Text style={[styles.navSub, { color: c.textSecondary }]}>
              {dist} remaining · {sourceLabel}
            </Text>
            <Text style={[styles.navDest, { color: c.text }]} numberOfLines={1}>
              To: {destLabel || "Destination"}
            </Text>
          </View>
          <Pressable
            onPress={onStopNavigation}
            style={[styles.stopBtn, { backgroundColor: c.error ?? "#EF4444" }]}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          bottom: bottomOffset,
        },
      ]}
    >
      <View style={styles.fieldRow}>
        <Ionicons name="radio-button-on" size={16} color={c.success} />
        <Pressable
          style={[
            styles.field,
            {
              backgroundColor: c.inputBg,
              borderColor: activeField === "start" ? c.primary : c.border,
            },
          ]}
          onPress={() => onFocusField("start")}
        >
          <Text
            style={{
              color: startLabel ? c.text : c.textSecondary,
              fontSize: FontSizes.sm,
            }}
            numberOfLines={1}
          >
            {startLabel || "Start point"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.fieldRow}>
        <Ionicons name="location" size={16} color={c.primary} />
        <Pressable
          style={[
            styles.field,
            {
              backgroundColor: c.inputBg,
              borderColor: activeField === "dest" ? c.primary : c.border,
            },
          ]}
          onPress={() => onFocusField("dest")}
        >
          <Text
            style={{
              color: destLabel ? c.text : c.textSecondary,
              fontSize: FontSizes.sm,
            }}
            numberOfLines={1}
          >
            {destLabel || "Destination"}
          </Text>
        </Pressable>
      </View>

      {activeField && (
        <View style={styles.searchBlock}>
          <View
            style={[
              styles.searchBox,
              { backgroundColor: c.inputBg, borderColor: c.border },
            ]}
          >
            <Ionicons name="search" size={16} color={c.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              placeholder={
                activeField === "start"
                  ? "Search start location…"
                  : "Search destination…"
              }
              placeholderTextColor={c.textSecondary}
              value={query}
              onChangeText={onChangeQuery}
              autoFocus
            />
            {searching && <ActivityIndicator size="small" color={c.primary} />}
          </View>

          {activeField === "start" && (
            <Pressable
              onPress={onUseMyLocationAsStart}
              style={[styles.myLocBtn, { borderColor: c.border }]}
            >
              <Ionicons name="navigate" size={16} color={c.primary} />
              <Text style={{ color: c.primary, fontWeight: "600", fontSize: 13 }}>
                Use my current location
              </Text>
            </Pressable>
          )}

          {offlineSearch && results.length > 0 && (
            <Text style={[styles.offlineHint, { color: c.textSecondary }]}>
              Offline — showing saved places
            </Text>
          )}

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 160 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPickResult(item)}
                style={[styles.resultRow, { borderBottomColor: c.border }]}
              >
                <Ionicons name="pin-outline" size={16} color={c.icon} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>
                    {item.name}
                  </Text>
                  <Text
                    style={{ color: c.textSecondary, fontSize: 11 }}
                    numberOfLines={1}
                  >
                    {item.address}
                  </Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              query.length >= 2 && !searching ? (
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 12,
                    padding: Spacing.sm,
                  }}
                >
                  No places found
                </Text>
              ) : null
            }
          />
        </View>
      )}

      {route && !activeField && (
        <Text style={[styles.routeMeta, { color: c.textSecondary }]}>
          {formatDistance(route.distanceMeters)} ·{" "}
          {formatDuration(route.durationSeconds)}
          {route.source === "straight" ? " · approximate" : ""}
          {route.source === "cache" ? " · offline cache" : ""}
        </Text>
      )}

      <Pressable
        onPress={onStartNavigation}
        disabled={!canNavigate}
        style={[
          styles.goBtn,
          {
            backgroundColor: canNavigate ? c.primary : c.border,
          },
        ]}
      >
        <Ionicons name="navigate" size={18} color="#fff" />
        <Text style={styles.goText}>Start navigation</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  field: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 40,
    justifyContent: "center",
  },
  searchBlock: { gap: 6 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    gap: 6,
    minHeight: 40,
  },
  searchInput: { flex: 1, fontSize: FontSizes.sm, paddingVertical: 6 },
  myLocBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  offlineHint: { fontSize: 11 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  routeMeta: { fontSize: 12, textAlign: "center" },
  goBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radii.md,
  },
  goText: { color: "#fff", fontWeight: "700", fontSize: FontSizes.md },
  navRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  navEta: { fontSize: 28, fontWeight: "800" },
  navSub: { fontSize: 13, marginTop: 2 },
  navDest: { fontSize: 14, fontWeight: "600", marginTop: 4 },
  stopBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});