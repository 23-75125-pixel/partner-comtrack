/**
 * Universal fallback for the `map` route.
 *
 * Metro resolves `map.native.tsx` on iOS/Android and `map.web.tsx` on web
 * at runtime — this plain file is never actually rendered on those
 * platforms. It exists only because `expo-router`'s static route
 * generation (this project uses `"web": { "output": "static" }`) requires
 * every route to have a non-platform-suffixed fallback file, or export
 * fails with "does not have a fallback sibling file without a platform
 * extension". Re-exporting the web screen is the safe default here since
 * it has no native-only dependencies.
 */
export { default } from "./map.web";
