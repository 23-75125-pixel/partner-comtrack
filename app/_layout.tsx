import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import "react-native-reanimated";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LiveFriendsProvider } from "@/contexts/LiveFriendsContext";
import { PresenceProvider } from "@/contexts/PresenceContext";
import { ProfilesProvider } from "@/contexts/ProfilesContext";
import { Colors, FontSizes, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { isSupabaseConfigured } from "@/lib/supabase";
import { NotificationsProvider } from "@/contexts/NotificationsContext";

export const unstable_settings = {
  anchor: "(auth)",
};

function ConfigMissingScreen() {
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];
  return (
    <View style={[styles.center, { backgroundColor: c.background }]}>
      <Text style={[styles.title, { color: c.text }]}>
        Supabase isn&apos;t configured
      </Text>
      <Text style={[styles.body, { color: c.textSecondary }]}>
        Create a .env file with EXPO_PUBLIC_SUPABASE_URL and
        EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example), then restart with
        `npx expo start -c`.
      </Text>
    </View>
  );
}

function RootNavigator() {
  const { session, user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key || loading) return;

    // `segments` is empty at the true root ("/"). Its generated type only
    // enumerates known non-root routes, so we widen it for this length check.
    const onSplash = (segments as readonly string[]).length === 0;
    if (onSplash) return;

    const inAuth = segments[0] === "(auth)";
    const inApp = segments[0] === "(app)";

    if (!session && inApp) {
      router.replace("/(auth)/login");
    } else if (session && inAuth) {
      router.replace("/(app)/map");
    }
  }, [session, loading, segments, navState?.key, router]);

  // inside RootNavigator:
return (
  <PresenceProvider userId={user?.id}>
    <LiveFriendsProvider>
      <NotificationsProvider>
        <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </NotificationsProvider>
    </LiveFriendsProvider>
  </PresenceProvider>
);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  if (!isSupabaseConfigured) {
    return (
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <ConfigMissingScreen />
        <StatusBar style="auto" />
      </ThemeProvider>
    );
  }

  return (
    <ProfilesProvider>
      <AuthProvider>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <RootNavigator />
          <StatusBar style="auto" />
        </ThemeProvider>
      </AuthProvider>
    </ProfilesProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xxxl,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    fontSize: FontSizes.sm,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});