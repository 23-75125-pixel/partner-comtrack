/**
 * Re-export from the shared context so existing imports keep working.
 * All realtime state lives in LiveFriendsProvider (mounted once at root).
 */
export {
  useLiveFriends,
  type ConnectionState,
} from "@/contexts/LiveFriendsContext";