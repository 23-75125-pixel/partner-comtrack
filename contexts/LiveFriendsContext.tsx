import { useAuth } from "@/contexts/AuthContext";
import { useProfiles } from "@/contexts/ProfilesContext";
import { Friendship, LocationRow, supabase } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ConnectionState = "connecting" | "connected" | "reconnecting";

type LiveFriendsContextType = {
  friendships: Friendship[];
  acceptedFriendIds: string[];
  acceptedFriendIdsKey: string;
  locations: Record<string, LocationRow>;
  loading: boolean;
  connectionState: ConnectionState;
  reload: () => Promise<void>;
};

const LiveFriendsContext = createContext<LiveFriendsContextType | undefined>(
  undefined,
);

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, i) => id === sortedB[i]);
}

/**
 * Single shared realtime source for friendships + friend locations.
 * Mounted once at the app root so Map / Friends / Chats never open
 * duplicate channels or fight over the same state.
 */
export function LiveFriendsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { ensureLoaded } = useProfiles();

  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [locations, setLocations] = useState<Record<string, LocationRow>>({});
  const [loading, setLoading] = useState(true);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");

  const locationsChannelRef = useRef<RealtimeChannel | null>(null);
  const friendIdsRef = useRef<string[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const acceptedFriendIds = useMemo(() => {
    if (!user) return [] as string[];
    return friendships
      .filter((f) => f.status === "accepted")
      .map((f) => (f.user_id === user.id ? f.friend_id : f.user_id));
  }, [friendships, user]);

  const acceptedFriendIdsKey = useMemo(
    () => acceptedFriendIds.slice().sort().join(","),
    [acceptedFriendIds],
  );

  const loadFriendships = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("friendships")
        .select("*")
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      if (error) {
        console.warn("[Friends] friendships fetch error:", error.message);
        return;
      }
      setFriendships((data || []) as Friendship[]);

      const otherIds = (data || []).map((f) =>
        f.user_id === user.id ? f.friend_id : f.user_id,
      );
      if (otherIds.length) void ensureLoaded(otherIds);
    } catch (e) {
      console.warn("[Friends] friendships load threw:", e);
    }
  }, [user, ensureLoaded]);

  const loadLocations = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setLocations((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .in("user_id", ids);

      if (error) {
        console.warn("[Friends] locations fetch error:", error.message);
        return;
      }

      const next: Record<string, LocationRow> = {};
      for (const row of (data || []) as LocationRow[]) {
        next[row.user_id] = row;
      }
      setLocations(next);
    } catch (e) {
      console.warn("[Friends] locations load threw:", e);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setFriendships([]);
      setLocations({});
      setLoading(false);
      setConnectionState("connected");
      return;
    }

    let cancelled = false;
    setLoading(true);
    loadFriendships().finally(() => {
      if (!cancelled) setLoading(false);
    });

    const channel = supabase
      .channel(`friendships-shared-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void loadFriendships();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `friend_id=eq.${user.id}`,
        },
        () => {
          void loadFriendships();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user, loadFriendships]);

  useEffect(() => {
    if (!user) return;

    const ids = acceptedFriendIds;
    if (sameIds(ids, friendIdsRef.current)) return;
    friendIdsRef.current = ids;

    if (locationsChannelRef.current) {
      void supabase.removeChannel(locationsChannelRef.current);
      locationsChannelRef.current = null;
    }

    if (ids.length === 0) {
      setLocations((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setConnectionState((prev) => (prev === "connected" ? prev : "connected"));
      return;
    }

    setConnectionState("connecting");
    void loadLocations(ids);

    const idFilter = `user_id=in.(${ids.join(",")})`;
    const channel = supabase
      .channel(`locations-shared-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "locations", filter: idFilter },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as Partial<LocationRow>)?.user_id;
            if (!oldId) return;
            setLocations((prev) => {
              if (!(oldId in prev)) return prev;
              const next = { ...prev };
              delete next[oldId];
              return next;
            });
            return;
          }
          const row = payload.new as LocationRow;
          if (!row?.user_id) return;
          setLocations((prev) => ({ ...prev, [row.user_id]: row }));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionState("connected");
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          void loadLocations(friendIdsRef.current);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setConnectionState("reconnecting");
          if (!reconnectTimerRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null;
              friendIdsRef.current = [];
              setReconnectNonce((n) => n + 1);
            }, 3000);
          }
        }
      });

    locationsChannelRef.current = channel;

    return () => {
      if (locationsChannelRef.current) {
        void supabase.removeChannel(locationsChannelRef.current);
        locationsChannelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, acceptedFriendIdsKey, loadLocations, reconnectNonce]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  const value = useMemo(
    () => ({
      friendships,
      acceptedFriendIds,
      acceptedFriendIdsKey,
      locations,
      loading,
      connectionState,
      reload: loadFriendships,
    }),
    [
      friendships,
      acceptedFriendIds,
      acceptedFriendIdsKey,
      locations,
      loading,
      connectionState,
      loadFriendships,
    ],
  );

  return (
    <LiveFriendsContext.Provider value={value}>
      {children}
    </LiveFriendsContext.Provider>
  );
}

export function useLiveFriends() {
  const ctx = useContext(LiveFriendsContext);
  if (!ctx) {
    throw new Error("useLiveFriends must be used within LiveFriendsProvider");
  }
  return ctx;
}