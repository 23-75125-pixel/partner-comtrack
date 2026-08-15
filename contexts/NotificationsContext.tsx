import { useAuth } from "@/contexts/AuthContext";
import {
  getExpoProjectId,
  isNativeNotificationsSupported,
} from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { AppState, Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type NotificationsContextType = {
  registerForPush: () => Promise<string | null>;
};

const NotificationsContext = createContext<
  NotificationsContextType | undefined
>(undefined);

type PermResult = {
  status?: string;
  granted?: boolean;
  canAskAgain?: boolean;
};

function readPermissions(
  value: Notifications.NotificationPermissionsStatus,
): PermResult {
  return value as unknown as PermResult;
}

function isGranted(
  value: Notifications.NotificationPermissionsStatus,
): boolean {
  const p = readPermissions(value);
  if (typeof p.granted === "boolean") return p.granted;
  return p.status === "granted";
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Messages & friends",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2563EB",
    sound: "default",
  });
}

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const responseSub = useRef<Notifications.Subscription | null>(null);

  const registerForPush = useCallback(async (): Promise<string | null> => {
    if (!isNativeNotificationsSupported()) return null;
    if (!Device.isDevice) {
      console.warn("[push] Physical device required for push notifications");
      return null;
    }

    try {
      await ensureAndroidChannel();

      const existing = await Notifications.getPermissionsAsync();
      let granted = isGranted(existing);

      if (!granted) {
        const requested = await Notifications.requestPermissionsAsync();
        granted = isGranted(requested);
      }

      if (!granted) {
        console.warn("[push] Permission not granted");
        return null;
      }

      const projectId = getExpoProjectId();
      const tokenResult = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      const token = tokenResult.data;
      if (!token || !user) return token;

      const { error } = await supabase.from("push_tokens").upsert(
        {
          user_id: user.id,
          token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      );
      if (error) console.warn("[push] token save error:", error.message);

      return token;
    } catch (e) {
      console.warn("[push] register failed:", e);
      return null;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void registerForPush();
  }, [user, registerForPush]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && user) void registerForPush();
    });
    return () => sub.remove();
  }, [user, registerForPush]);

  useEffect(() => {
    responseSub.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as
          | Record<string, string>
          | undefined;
        if (!data?.type) return;

        if (data.type === "message" && data.friendId) {
          router.push(`/(app)/chat/${data.friendId}`);
        } else if (data.type === "friend_request") {
          router.push("/(app)/friends");
        }
      });

    return () => {
      responseSub.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const showLocal = async (
      title: string,
      body: string,
      data: Record<string, unknown>,
    ) => {
      if (AppState.currentState === "active") return;
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data,
            sound: "default",
          },
          trigger: null,
        });
      } catch (e) {
        console.warn("[push] local schedule failed:", e);
      }
    };

    const channel = supabase
      .channel(`notif-inbox-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        async (payload) => {
          const msg = payload.new as {
            sender_id: string;
            content: string;
          };
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", msg.sender_id)
            .maybeSingle();
          await showLocal(
            profile?.username ?? "New message",
            msg.content,
            { type: "message", friendId: msg.sender_id },
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "friendships",
          filter: `friend_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as {
            user_id: string;
            status: string;
          };
          if (row.status !== "pending") return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", row.user_id)
            .maybeSingle();
          await showLocal(
            "Friend request",
            `${profile?.username ?? "Someone"} wants to be friends`,
            { type: "friend_request", fromId: row.user_id },
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <NotificationsContext.Provider value={{ registerForPush }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within NotificationsProvider",
    );
  }
  return ctx;
}