import { useAuth } from "@/contexts/AuthContext";
import { useProfiles } from "@/contexts/ProfilesContext";
import { Friendship, LocationRow, supabase } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionState = "connecting" | "connected" | "reconnecting";

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, i) => id === sortedB[i]);
}

/**
 * Single realtime data source for "my friendships" and "my friends' live
 * locations/battery". Used by both the Map screen and the Friends screen so
 * they can never disagree about who's a friend, where they are, or their
 * battery level — and so we only pay for one set of subscriptions, not one
 * per screen.
 */
export function useLiveFriends() {
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

  const acceptedFriendIds = friendships
    .filter((f) => f.status === "accepted")
    .map((f) => (f.user_id === user?.id ? f.friend_id : f.user_id));

  const loadFriendships = useCallback(async () => {
    if (!user) return;
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
    void ensureLoaded(otherIds);
  }, [user, ensureLoaded]);

  const loadLocations = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setLocations({});
      return;
    }
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
  }, []);

  // Friendships: two filtered subscriptions (I can be either side of the
  // row) instead of listening to the whole table.
  useEffect(() => {
    if (!user) {
      setFriendships([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    loadFriendships().finally(() => setLoading(false));

    const channel = supabase
      .channel(`friendships-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadFriendships(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `friend_id=eq.${user.id}`,
        },
        () => loadFriendships(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadFriendships]);

  // Locations: one subscription scoped to exactly my accepted friends'
  // ids, rebuilt only when that id set actually changes. Events are merged
  // directly into state (keyed by user_id) instead of triggering a full
  // reload, so a friend's marker updates instantly with no duplicate
  // markers, no unrelated re-fetches, and no flicker.
  useEffect(() => {
    if (!user) return;

    const ids = acceptedFriendIds;
    if (sameIds(ids, friendIdsRef.current)) return;
    friendIdsRef.current = ids;

    if (locationsChannelRef.current) {
      supabase.removeChannel(locationsChannelRef.current);
      locationsChannelRef.current = null;
    }

    if (ids.length === 0) {
      setLocations({});
      setConnectionState("connected");
      return;
    }

    setConnectionState("connecting");
    void loadLocations(ids);

    const idFilter = `user_id=in.(${ids.join(",")})`;
    const channel = supabase
      .channel(`locations-${user.id}`)
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
          // Reconcile once on (re)connect in case any events were missed
          // while we were offline.
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
              // Force the effect below to rebuild the channel from scratch.
              friendIdsRef.current = [];
              setReconnectNonce((n) => n + 1);
            }, 3000);
          }
        }
      });

    locationsChannelRef.current = channel;

    return () => {
      if (locationsChannelRef.current) {
        supabase.removeChannel(locationsChannelRef.current);
        locationsChannelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, acceptedFriendIds.join(","), loadLocations, reconnectNonce]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  return {
    friendships,
    acceptedFriendIds,
    locations,
    loading,
    connectionState,
    reload: loadFriendships,
  };
}
