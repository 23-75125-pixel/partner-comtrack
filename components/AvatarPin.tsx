import { Radii } from "@/constants/theme";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

type Props = {
  initial: string;
  color: string;
  imageUri?: string | null;
  batteryLevel?: number | null;
  isCharging?: boolean | null;
  /** Dims the pin for a friend who's offline / has a stale location. */
  faded?: boolean;
};

/** The avatar bubble rendered inside a MapLibre <Marker>. */
export function AvatarPin({
  initial,
  color,
  imageUri,
  batteryLevel,
  isCharging,
  faded = false,
}: Props) {
  return (
    <View style={[styles.wrap, faded && styles.faded]} pointerEvents="none">
      <View style={[styles.avatar, { backgroundColor: color }]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <Text style={styles.initial}>{initial}</Text>
        )}
      </View>
      <View style={[styles.tip, { borderTopColor: color }]} />
      {batteryLevel != null && (
        <View
          style={[
            styles.badge,
            { backgroundColor: isCharging ? "#10B981" : "#0F172A" },
          ]}
        >
          {isCharging && <Text style={styles.badgeBolt}>⚡</Text>}
          <Text style={styles.badgeText}>{batteryLevel}%</Text>
        </View>
      )}
    </View>
  );
}

const SIZE = 42;

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  faded: {
    opacity: 0.45,
  },
  avatar: {
    width: SIZE,
    height: SIZE,
    borderRadius: Radii.full,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 6,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  initial: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  tip: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  badge: {
    position: "absolute",
    right: -4,
    top: -4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeBolt: {
    fontSize: 8,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
});
