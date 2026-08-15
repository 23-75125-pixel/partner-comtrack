import { supabase } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type PresenceContextType = {
  /** User ids currently online (have the app open with an active session). */
  onlineIds: Set<string>;
  isOnline: (id: string | null | undefined) => boolean;
};

const PresenceContext = createContext<PresenceContextType | undefined>(
  undefined,
);

/**
 * Tracks who's currently online using Supabase Realtime Presence — an
 * ephemeral, in-memory concept tied to the socket connection itself. When a
 * device goes offline (kills the app, loses connection, backgrounds long
 * enough to disconnect) Supabase removes it from presence automatically, so
 * there's no stale "online" state to manage and no extra table/writes.
 */
export function PresenceProvider({
  userId,
  children,
}: {
  userId: string | null | undefined;
  children: React.ReactNode;
}) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) {
      setOnlineIds(new Set());
      return;
    }

    const channel = supabase.channel("presence:online-users", {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    const syncOnlineIds = () => {
      const state = channel.presenceState();
      setOnlineIds(new Set(Object.keys(state)));
    };

    channel
      .on("presence", { event: "sync" }, syncOnlineIds)
      .on("presence", { event: "join" }, syncOnlineIds)
      .on("presence", { event: "leave" }, syncOnlineIds)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId]);

  const isOnline = React.useCallback(
    (id: string | null | undefined) => !!id && onlineIds.has(id),
    [onlineIds],
  );

  const value = React.useMemo(
    () => ({ onlineIds, isOnline }),
    [onlineIds, isOnline],
  );

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresence must be used within PresenceProvider");
  return ctx;
}