import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Fixed (non-safe-area) chrome height of the bottom tab bar. */
const TAB_BAR_CONTENT_HEIGHT = 56;
const TAB_BAR_VERTICAL_PADDING = 16;

/**
 * Returns the actual on-screen height of the bottom tab bar for the current
 * device — content height plus the device's bottom safe-area inset (nav
 * bar / gesture area). Used by the tab layout itself AND by every screen
 * that needs to keep content from being hidden behind the bar, so they can
 * never drift out of sync across phones, tablets, and aspect ratios.
 */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  const height =
    TAB_BAR_CONTENT_HEIGHT + TAB_BAR_VERTICAL_PADDING + insets.bottom;
  return { height, bottomInset: insets.bottom };
}
