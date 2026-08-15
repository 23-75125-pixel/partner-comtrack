import { Profile, supabase } from "@/lib/supabase";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ProfilesContextType = {
  /** Cache of every profile we've seen, keyed by user id. */
  profiles: Record<string, Profile>;
  getProfile: (id: string | null | undefined) => Profile | undefined;
  /** Fetches any of the given ids we don't already have cached. */
  ensureLoaded: (ids: (string | null | undefined)[]) => Promise<void>;
  /** Force-refetches the given ids from the server. */
  refresh: (ids: (string | null | undefined)[]) => Promise<void>;
  /** Optimistically merge a known-fresh profile into the cache immediately. */
  upsertLocal: (profile: Profile) => void;
};

const ProfilesContext = createContext<ProfilesContextType | undefined>(
  undefined,
);

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const inFlightRef = useRef<Set<string>>(new Set());

  // Single app-wide realtime subscription. Any profile change — anyone's
  // avatar, username, etc. — is pushed into the shared cache immediately,
  // so every screen reading from this context updates in realtime without
  // its own subscription, restart, or manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel("profiles-realtime-cache")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as Partial<Profile>)?.id;
            if (!oldId) return;
            setProfiles((prev) => {
              if (!(oldId in prev)) return prev;
              const next = { ...prev };
              delete next[oldId];
              return next;
            });
            return;
          }
          const row = payload.new as Profile;
          if (!row?.id) return;
          setProfiles((prev) => ({ ...prev, [row.id]: row }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getProfile = useCallback(
    (id: string | null | undefined) => (id ? profilesRef.current[id] : undefined),
    [],
  );

  const fetchIds = useCallback(async (ids: string[]) => {
    const unique = Array.from(new Set(ids)).filter(
      (id) => !inFlightRef.current.has(id),
    );
    if (unique.length === 0) return;

    unique.forEach((id) => inFlightRef.current.add(id));
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("id", unique);

      if (error) {
        console.warn("[Profiles] fetch error:", error.message);
        return;
      }

      if (data?.length) {
        setProfiles((prev) => {
          const next = { ...prev };
          for (const row of data as Profile[]) next[row.id] = row;
          return next;
        });
      }
    } finally {
      unique.forEach((id) => inFlightRef.current.delete(id));
    }
  }, []);

  const ensureLoaded = useCallback(
    async (ids: (string | null | undefined)[]) => {
      const missing = ids.filter(
        (id): id is string => !!id && !profilesRef.current[id],
      );
      if (missing.length === 0) return;
      await fetchIds(missing);
    },
    [fetchIds],
  );

  const refresh = useCallback(
    async (ids: (string | null | undefined)[]) => {
      const valid = ids.filter((id): id is string => !!id);
      if (valid.length === 0) return;
      await fetchIds(valid);
    },
    [fetchIds],
  );

  const upsertLocal = useCallback((profile: Profile) => {
    setProfiles((prev) => {
      const existing = prev[profile.id];
      if (
        existing &&
        existing.username === profile.username &&
        existing.avatar_url === profile.avatar_url &&
        existing.email === profile.email
      ) {
        return prev;
      }
      return { ...prev, [profile.id]: profile };
    });
  }, []);

  const value = useMemo(
    () => ({ profiles, getProfile, ensureLoaded, refresh, upsertLocal }),
    [profiles, getProfile, ensureLoaded, refresh, upsertLocal],
  );

  return (
    <ProfilesContext.Provider value={value}>
      {children}
    </ProfilesContext.Provider>
  );
}

export function useProfiles() {
  const ctx = useContext(ProfilesContext);
  if (!ctx) throw new Error("useProfiles must be used within ProfilesProvider");
  return ctx;
}