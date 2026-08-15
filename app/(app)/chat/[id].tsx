import { Colors, FontSizes, Radii, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { usePresence } from "@/contexts/PresenceContext";
import { useProfiles } from "@/contexts/ProfilesContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getAvatarDisplay } from "@/lib/avatar";
import { notifyUser } from "@/lib/notifications";
import { Message, supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  const { getProfile, ensureLoaded } = useProfiles();
  const { isOnline } = usePresence();
  const friend = getProfile(id);

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (id) void ensureLoaded([id]);
  }, [id, ensureLoaded]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 50);
    };
    const onHide = () => setKeyboardHeight(0);

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const load = useCallback(async () => {
    if (!user || !id) return;

    const { data: msgs, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${user.id})`,
      )
      .order("created_at", { ascending: true });

    if (error) console.warn("Chat load error:", error.message);
    setMessages((msgs || []) as Message[]);
    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    load();
    if (!user || !id) return;

    const addMessage = (msg: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    const channel = supabase
      .channel(`chat-${user.id}-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.receiver_id === id) addMessage(msg);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.sender_id === id) addMessage(msg);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, id, load]);

  const send = async () => {
    if (!text.trim() || !user || !id || sending) return;
    setSending(true);
    const content = text.trim();
    setText("");

    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: id,
      content,
    });
    if (error) {
      console.warn("Send message error:", error.message);
      setText(content);
    } else {
      const senderName = profile?.username ?? "Someone";
      void notifyUser(id, {
        title: senderName,
        body: content,
        data: { type: "message", friendId: user.id },
      });
    }
    setSending(false);
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  };

  const renderMsg = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;
    return (
      <View
        style={[
          styles.bubble,
          isMe
            ? { alignSelf: "flex-end", backgroundColor: c.primary }
            : {
                alignSelf: "flex-start",
                backgroundColor: c.surface,
                borderColor: c.border,
                borderWidth: 1,
              },
        ]}
      >
        <Text style={{ color: isMe ? "#fff" : c.text, fontSize: FontSizes.md }}>
          {item.content}
        </Text>
        <Text
          style={{
            color: isMe ? "rgba(255,255,255,0.7)" : c.textSecondary,
            fontSize: 10,
            marginTop: 4,
            alignSelf: "flex-end",
          }}
        >
          {new Date(item.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    );
  };

  const display = getAvatarDisplay(friend, c.primary);
  const online = isOnline(id);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: c.background }]}
      edges={["top"]}
    >
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={c.primary} />
        </Pressable>
        <View style={styles.avatarWrap}>
          {display.imageUri ? (
            <Image
              source={{ uri: display.imageUri }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: display.color }]}>
              <Text style={styles.avatarText}>{display.initial}</Text>
            </View>
          )}
          <View
            style={[
              styles.onlineDot,
              {
                backgroundColor: online ? c.success : c.icon,
                borderColor: c.background,
              },
            ]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.headerName, { color: c.text }]}
            numberOfLines={1}
          >
            {friend?.username ?? "Chat"}
          </Text>
          <Text style={[styles.headerStatus, { color: c.textSecondary }]}>
            {online ? "Online" : "Offline"}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={c.primary} />
      ) : (
        <View style={styles.body}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMsg}
            contentContainerStyle={styles.list}
            style={styles.listFlex}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          />

          <View
            style={[
              styles.inputBar,
              {
                backgroundColor: c.surface,
                borderTopColor: c.border,
                paddingBottom:
                  keyboardHeight > 0
                    ? Spacing.sm
                    : Math.max(insets.bottom, Spacing.sm),
                // Lift the whole input bar above the keyboard
                marginBottom: keyboardHeight,
              },
            ]}
          >
            <TextInput
              style={[
                styles.input,
                { backgroundColor: c.inputBg, color: c.text },
              ]}
              placeholder="Type a message…"
              placeholderTextColor={c.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
              textAlignVertical="center"
              blurOnSubmit={false}
              onFocus={() => {
                setTimeout(() => {
                  listRef.current?.scrollToEnd({ animated: true });
                }, 100);
              }}
            />
            <Pressable
              onPress={send}
              disabled={!text.trim() || sending}
              style={[
                styles.sendBtn,
                { backgroundColor: text.trim() ? c.primary : c.border },
              ]}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  back: { padding: Spacing.sm },
  avatarWrap: { position: "relative", marginRight: Spacing.sm },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  onlineDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  headerName: { fontSize: FontSizes.lg, fontWeight: "600" },
  headerStatus: { fontSize: FontSizes.xs, marginTop: 1 },
  listFlex: { flex: 1 },
  list: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    flexGrow: 1,
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.lg,
    marginBottom: Spacing.sm,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Platform.OS === "ios" ? Spacing.md : Spacing.sm,
    fontSize: FontSizes.md,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});