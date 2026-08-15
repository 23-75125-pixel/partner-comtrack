import { EmptyState } from "@/components/EmptyState";
import { Colors, FontSizes, Radii, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useProfiles } from "@/contexts/ProfilesContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLiveFriends } from "@/hooks/use-live-friends";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { getAvatarDisplay } from "@/lib/avatar";
import { Message, supabase } from "@/lib/supabase";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChatsScreen() {
  const { user } = useAuth();
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];
  const { height: tabBarHeight } = useTabBarHeight();

  // Friend list comes from the same realtime source as Map/Friends —
  // a newly-accepted friend appears here instantly, no restart needed.
  const {
    acceptedFriendIds,
    loading: friendsLoading,
    reload: reloadFriends,
  } = useLiveFriends();
  const { getProfile, ensureLoaded } = useProfiles();

  const [lastMessages, setLastMessages] = useState<Record<string, Message>>(
    {},
  );
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void ensureLoaded(acceptedFriendIds);
  }, [acceptedFriendIds, ensureLoaded]);

  const loadLastMessages = useCallback(async () => {
    if (!user || acceptedFriendIds.length === 0) {
      setLastMessages({});
      setMessagesLoading(false);
      return;
    }

    // One query for everyone I might be chatting with, instead of an
    // N+1 loop — then keep only the newest message per conversation.
    const orFilter = acceptedFriendIds
      .map(
        (id) =>
          `and(sender_id.eq.${user.id},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${user.id})`,
      )
      .join(",");

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(orFilter)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Chats load error:", error.message);
      setMessagesLoading(false);
      return;
    }

    const next: Record<string, Message> = {};
    for (const msg of (data || []) as Message[]) {
      const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      if (!next[otherId]) next[otherId] = msg; // first hit per friend = newest
    }
    setLastMessages(next);
    setMessagesLoading(false);
  }, [user, acceptedFriendIds]);

  useEffect(() => {
    void loadLastMessages();
  }, [loadLastMessages]);

  // Realtime: any message I send or receive updates the relevant preview
  // immediately, so chat list previews never go stale waiting on a
  // manual pull-to-refresh.
  useEffect(() => {
    if (!user) return;

    const applyMessage = (row: Message) => {
      const otherId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
      setLastMessages((prev) => {
        const current = prev[otherId];
        if (current && new Date(current.created_at) >= new Date(row.created_at)) {
          return prev;
        }
        return { ...prev, [otherId]: row };
      });
    };

    const channel = supabase
      .channel(`chats-preview-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => applyMessage(payload.new as Message),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => applyMessage(payload.new as Message),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const chats = useMemo(
    () =>
      [...acceptedFriendIds]
        .map((id) => ({ friendId: id, lastMessage: lastMessages[id] }))
        .sort((a, b) => {
          const ta = a.lastMessage?.created_at ?? "";
          const tb = b.lastMessage?.created_at ?? "";
          return tb.localeCompare(ta);
        }),
    [acceptedFriendIds, lastMessages],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([reloadFriends(), loadLastMessages()]);
    setRefreshing(false);
  };

  const renderItem = ({
    item,
  }: {
    item: { friendId: string; lastMessage?: Message };
  }) => {
    const friendProfile = getProfile(item.friendId);
    const display = getAvatarDisplay(friendProfile, c.primary);

    return (
      <Pressable
        onPress={() => router.push(`/(app)/chat/${item.friendId}`)}
        style={[
          styles.row,
          { backgroundColor: c.surface, borderColor: c.border },
        ]}
      >
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
        <View style={styles.info}>
          <Text style={[styles.name, { color: c.text }]}>
            {friendProfile?.username ?? "…"}
          </Text>
          <Text
            style={[styles.preview, { color: c.textSecondary }]}
            numberOfLines={1}
          >
            {item.lastMessage?.content ?? "Say hello 👋"}
          </Text>
        </View>
        {item.lastMessage && (
          <Text style={[styles.time, { color: c.textSecondary }]}>
            {new Date(item.lastMessage.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        )}
      </Pressable>
    );
  };

  const loading = friendsLoading || messagesLoading;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: c.background }]}
      edges={["top"]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Chats</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(i) => i.friendId}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: tabBarHeight + Spacing.lg },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="No conversations"
              subtitle="Add friends first, then start chatting with them here."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "700",
  },
  list: {
    paddingHorizontal: Spacing.xxl,
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 18,
  },
  info: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  name: {
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  preview: {
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  time: {
    fontSize: FontSizes.xs,
  },
});
