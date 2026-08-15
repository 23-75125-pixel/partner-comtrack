import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width } = Dimensions.get('window');
const LOGO_SIZE = Math.min(width * 0.55, 220);

export default function SplashScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];

  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(16);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);

  const goNext = useCallback(() => {
    if (session) {
      router.replace('/(app)/map');
    } else {
      router.replace('/(auth)/login');
    }
  }, [session, router]);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withTiming(1.08, { duration: 700, easing: Easing.out(Easing.back(1.4)) }),
      withTiming(1, { duration: 280, easing: Easing.inOut(Easing.quad) })
    );

    ringOpacity.value = withDelay(200, withTiming(0.35, { duration: 500 }));
    ringScale.value = withDelay(
      200,
      withSequence(
        withTiming(1.25, { duration: 900, easing: Easing.out(Easing.cubic) }),
        withTiming(1.15, { duration: 400 })
      )
    );

    titleOpacity.value = withDelay(450, withTiming(1, { duration: 500 }));
    titleY.value = withDelay(
      450,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(goNext, 2400);
    return () => clearTimeout(t);
  }, [loading, goNext]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.center}>
        <Animated.View style={[styles.ring, ringStyle, { borderColor: c.primary }]} />
        <Animated.View style={logoStyle}>
          <Image
            source={require('@/assets/images/app-logo.png')}
            style={styles.logo}
            resizeMode="cover"
          />
        </Animated.View>
      </View>

      <Animated.View style={[styles.titleWrap, titleStyle]}>
        <Text style={[styles.title, { color: c.text }]}>Realtime Location</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Share live · Stay connected
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    width: LOGO_SIZE + 40,
    height: LOGO_SIZE + 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: LOGO_SIZE + 28,
    height: LOGO_SIZE + 28,
    borderRadius: (LOGO_SIZE + 28) / 2,
    borderWidth: 2,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  titleWrap: {
    marginTop: Spacing.xxxl,
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    marginTop: Spacing.sm,
  },
});