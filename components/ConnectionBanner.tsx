import { Colors, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLiveFriends } from "@/hooks/use-live-friends";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function ConnectionBanner() {
  const { connectionState } = useLiveFriends();
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];

  if (connectionState === "connected") return null;

  const reconnecting = connectionState === "reconnecting";
  const bg = reconnecting ? "#F59E0B" : c.primary;
  const label = reconnecting
    ? "Reconnecting to live updates…"
    : "Connecting…";
  const icon = reconnecting ? "cloud-offline-outline" : "sync-outline";

  return (
    <View style={[styles.bar, { backgroundColor: bg }]}>
      <Ionicons name={icon as any} size={14} color="#fff" />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  text: {
    color: "#fff",
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
});