/**
 * Minimalist design system for Realtime Location
 * Consistent colors, spacing, radii, and typography.
 */

import { Platform } from 'react-native';

export const Palette = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryLight: '#3B82F6',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#0EA5E9',

  // Neutrals
  white: '#FFFFFF',
  black: '#0F172A',
  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',
};

export const Colors = {
  light: {
    text: Palette.gray900,
    textSecondary: Palette.gray500,
    background: Palette.gray50,
    surface: Palette.white,
    surfaceElevated: Palette.white,
    border: Palette.gray200,
    tint: Palette.primary,
    icon: Palette.gray500,
    tabIconDefault: Palette.gray400,
    tabIconSelected: Palette.primary,
    primary: Palette.primary,
    success: Palette.success,
    error: Palette.error,
    inputBg: Palette.gray100,
    overlay: 'rgba(15, 23, 42, 0.45)',
  },
  dark: {
    text: Palette.gray50,
    textSecondary: Palette.gray400,
    background: Palette.gray900,
    surface: Palette.gray800,
    surfaceElevated: Palette.gray800,
    border: Palette.gray700,
    tint: Palette.primaryLight,
    icon: Palette.gray400,
    tabIconDefault: Palette.gray500,
    tabIconSelected: Palette.primaryLight,
    primary: Palette.primaryLight,
    success: Palette.success,
    error: Palette.error,
    inputBg: Palette.gray700,
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const FontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  title: 32,
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    rounded: "'SF Pro Rounded', system-ui, sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
});
