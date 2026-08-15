import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import { Platform } from "react-native";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export async function notifyUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId);

    if (error) {
      console.warn("[notify] token fetch error:", error.message);
      return;
    }
    const tokens = (data || [])
      .map((r) => r.token as string)
      .filter(Boolean);
    if (tokens.length === 0) return;

    await sendExpoPush(tokens, payload);
  } catch (e) {
    console.warn("[notify] failed:", e);
  }
}

async function sendExpoPush(tokens: string[], payload: PushPayload) {
  const messages = tokens.map((to) => ({
    to,
    sound: "default" as const,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    channelId: "default",
    priority: "high" as const,
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn("[notify] Expo push HTTP error:", res.status, text);
  }
}

export function getExpoProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

export function isNativeNotificationsSupported() {
  return Platform.OS === "ios" || Platform.OS === "android";
}