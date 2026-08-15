import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Web fallback — @maplibre/maplibre-react-native is native-only (it wraps
 * the native MapLibre SDKs, not maplibre-gl JS).
 * Open the app in Expo Go / a dev build on a phone to use the live map.
 */
export default function MapScreenWeb() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];

  return (
    <SafeAreaView style={[styles.center, { backgroundColor: c.background }]}>
      <Ionicons name="map-outline" size={56} color={c.icon} />
      <Text style={[styles.title, { color: c.text }]}>Map is mobile-only</Text>
      <Text style={[styles.sub, { color: c.textSecondary }]}>
        Open this app on Android (scan the QR code with Expo Go, or install a
        dev build) to see the live MapLibre map, avatars, and realtime friend
        locations.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  sub: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});
