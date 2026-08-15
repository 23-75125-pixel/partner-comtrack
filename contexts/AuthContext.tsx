import { useProfiles } from "@/contexts/ProfilesContext";
import { Profile, supabase } from "@/lib/supabase";
import { Session, User } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    username: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  // Profiles live in one shared, realtime-synced cache (ProfilesContext) so
  // that this user's own avatar/username, once loaded, stays in sync with
  // anywhere else it's displayed — and updates from the profile screen are
  // visible immediately without a separate refetch path.
  const { getProfile, ensureLoaded, refresh } = useProfiles();
  const profile = getProfile(user?.id) ?? null;

  const loadProfile = useCallback(
    async (userId: string) => {
      await ensureLoaded([userId]);
      setProfileLoaded(true);
    },
    [ensureLoaded],
  );

  const refreshProfile = useCallback(async () => {
    if (user?.id) await refresh([user.id]);
  }, [user, refresh]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfileLoaded(false);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, username: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) return { error: error.message };

    // A DB trigger (see SUPABASE_SCHEMA.sql: handle_new_user) already
    // creates a starter profile row on signup. We upsert here too so the
    // chosen username is saved immediately rather than waiting on the
    // trigger's default (email-prefix) value.
    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        username,
        avatar_url: null,
      });
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading: loading || (!!user && !profileLoaded),
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
