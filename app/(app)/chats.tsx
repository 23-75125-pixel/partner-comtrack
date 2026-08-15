import { ConnectionBanner } from "@/components/ConnectionBanner";
import { EmptyState } from "@/components/EmptyState";
import { SearchBar } from "@/components/SearchBar";
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

  const {
    acceptedFriendIds,
    acceptedFriendIdsKey,
    loading: friendsLoading,
    reload: reloadFriends,
  } = useLiveFriends();
  const { getProfile, ensureLoaded } = useProfiles();

  const [lastMessages, setLastMessages] = useState<Record<string, Message>>(
    {},
  );
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!acceptedFriendIdsKey) return;
    void ensureLoaded(acceptedFriendIdsKey.split(","));
  }, [acceptedFriendIdsKey, ensureLoaded]);

  const loadLastMessages = useCallback(async () => {
    if (!user || !acceptedFriendIdsKey) {
      setLastMessages((prev) =>
        Object.keys(prev).length === 0 ? prev : {},
      );
      setUnreadCounts({});
      setMessagesLoading(false);
      return;
    }

    const ids = acceptedFriendIdsKey.split(",");

    const orFilter = ids
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
    const unreads: Record<string, number> = {};
    for (const msg of (data || []) as Message[]) {
      const otherId =
        msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      if (!next[otherId]) next[otherId] = msg;
      if (msg.receiver_id === user.id && !msg.read_at) {
        unreads[otherId] = (unreads[otherId] ?? 0) + 1;
      }
    }
    setLastMessages(next);
    setUnreadCounts(unreads);
    setMessagesLoading(false);
  }, [user, acceptedFriendIdsKey]);

  useEffect(() => {
    void loadLastMessages();
  }, [loadLastMessages]);

  useEffect(() => {
    if (!user) return;

    const applyMessage = (row: Message) => {
      const otherId =
        row.sender_id === user.id ? row.receiver_id : row.sender_id;
      setLastMessages((prev) => {
        const current = prev[otherId];
        if (
          current &&
          new Date(current.created_at) >= new Date(row.created_at)
        ) {
          return prev;
        }
        return { ...prev, [otherId]: row };
      });
      if (row.receiver_id === user.id && !row.read_at) {
        setUnreadCounts((prev) => ({
          ...prev,
          [otherId]: (prev[otherId] ?? 0) + 1,
        }));
      }
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          void loadLastMessages();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadLastMessages]);

  const chats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...acceptedFriendIds]
      .map((id) => ({
        friendId: id,
        lastMessage: lastMessages[id],
        unread: unreadCounts[id] ?? 0,
      }))
      .filter((row) => {
        if (!q) return true;
        const name = getProfile(row.friendId)?.username?.toLowerCase() ?? "";
        const preview = row.lastMessage?.content?.toLowerCase() ?? "";
        return name.includes(q) || preview.includes(q);
      })
      .sort((a, b) => {
        if (a.unread !== b.unread) return b.unread - a.unread;
        const ta = a.lastMessage?.created_at ?? "";
        const tb = b.lastMessage?.created_at ?? "";
        return tb.localeCompare(ta);
      });
  }, [acceptedFriendIds, lastMessages, unreadCounts, query, getProfile]);

  const totalUnread = useMemo(
    () => Object.values(unreadCounts).reduce((s, n) => s + n, 0),
    [unreadCounts],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([reloadFriends(), loadLastMessages()]);
    setRefreshing(false);
  };

  const renderItem = ({
    item,
  }: {
    item: { friendId: string; lastMessage?: Message; unread: number };
  }) => {
    const friendProfile = getProfile(item.friendId);
    const display = getAvatarDisplay(friendProfile, c.primary);
    const isUnread = item.unread > 0;

    return (
      <Pressable
        onPress={() => router.push(`/(app)/chat/${item.friendId}`)}
        style={[
          styles.row,
          { backgroundColor: c.surface, borderColor: c.border },
        ]}
      >
        <View>
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
        </View>
        <View style={styles.info}>
          <Text
            style={[
              styles.name,
              { color: c.text, fontWeight: isUnread ? "700" : "600" },
            ]}
          >
            {friendProfile?.username ?? "…"}
          </Text>
          <Text
            style={[
              styles.preview,
              {
                color: isUnread ? c.text : c.textSecondary,
                fontWeight: isUnread ? "600" : "400",
              },
            ]}
            numberOfLines={1}
          >
            {item.lastMessage?.content ?? "Say hello 👋"}
          </Text>
        </View>
        <View style={styles.meta}>
          {item.lastMessage && (
            <Text style={[styles.time, { color: c.textSecondary }]}>
              {formatChatTime(item.lastMessage.created_at)}
            </Text>
          )}
          {isUnread && (
            <View style={[styles.badge, { backgroundColor: c.primary }]}>
              <Text style={styles.badgeText}>
                {item.unread > 99 ? "99+" : item.unread}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const loading = friendsLoading || messagesLoading;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: c.background }]}
      edges={["top"]}
    >
      <ConnectionBanner />
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Chats</Text>
        {totalUnread > 0 && (
          <View style={[styles.headerBadge, { backgroundColor: c.primary }]}>
            <Text style={styles.badgeText}>
              {totalUnread > 99 ? "99+" : totalUnread}
            </Text>
          </View>
        )}
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search chats…"
      />

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
              title={query ? "No matches" : "No conversations"}
              subtitle={
                query
                  ? "Try a different name or message."
                  : "Add friends first, then start chatting with them here."
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function formatChatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "700",
  },
  headerBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
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
  },
  preview: {
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  meta: {
    alignItems: "flex-end",
    gap: 6,
  },
  time: {
    fontSize: FontSizes.xs,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
});