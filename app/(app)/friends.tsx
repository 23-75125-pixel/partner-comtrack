import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/Button";
import { Colors, FontSizes, Radii, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { usePresence } from "@/contexts/PresenceContext";
import { useProfiles } from "@/contexts/ProfilesContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useLiveFriends } from "@/hooks/use-live-friends";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { getAvatarDisplay } from "@/lib/avatar";
import { Friendship, Profile, supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { notifyUser } from "@/lib/notifications";

type FriendRow = {
  id: string;
  status: Friendship["status"];
  friendId: string;
  direction: "incoming" | "outgoing" | "accepted";
};

export default function FriendsScreen() {
  const { user, profile } = useAuth();
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];
  const { height: tabBarHeight } = useTabBarHeight();

  // Single realtime source of truth for friendships + friend locations,
  // shared with the Map screen — the same data always agrees everywhere.
  const { friendships, locations, loading: friendsLoading, reload } =
    useLiveFriends();
  const { getProfile, ensureLoaded, upsertLocal } = useProfiles();
  const { isOnline } = usePresence();

  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"friends" | "discover">("friends");

  const friends: FriendRow[] = useMemo(() => {
    if (!user) return [];
    return friendships.map((f) => {
      const friendId = f.user_id === user.id ? f.friend_id : f.user_id;
      let direction: FriendRow["direction"] = "accepted";
      if (f.status === "pending") {
        direction = f.user_id === user.id ? "outgoing" : "incoming";
      }
      return { id: f.id, status: f.status, friendId, direction };
    });
  }, [friendships, user]);

  const relatedFriendIdsKey = useMemo(
    () =>
      friends
        .map((f) => f.friendId)
        .sort()
        .join(","),
    [friends],
  );

  useEffect(() => {
    if (!relatedFriendIdsKey) return;
    void ensureLoaded(relatedFriendIdsKey.split(","));
  }, [relatedFriendIdsKey, ensureLoaded]);

  const loadDiscover = useCallback(async () => {
    if (!user) {
      setDiscoverLoading(false);
      return;
    }
    try {
      const relatedIds = new Set(
        relatedFriendIdsKey ? relatedFriendIdsKey.split(",") : [],
      );
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", user.id);

      if (error) {
        console.warn("Discover load error:", error.message);
        return;
      }

      const others = (data || []) as Profile[];
      others.forEach((p) => upsertLocal(p)); // warm the shared cache
      setAllUsers(others.filter((p) => !relatedIds.has(p.id)));
    } catch (e) {
      console.warn("Discover load threw:", e);
    } finally {
      setDiscoverLoading(false);
    }
  }, [user, relatedFriendIdsKey, upsertLocal]);

  useEffect(() => {
    void loadDiscover();
  }, [loadDiscover]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([reload(), loadDiscover()]);
    setRefreshing(false);
  };

  

 const sendRequest = async (friendId: string) => {
  if (!user) return;
  const { error } = await supabase.from("friendships").insert({
    user_id: user.id,
    friend_id: friendId,
    status: "pending",
  });
  if (error) {
    Alert.alert("Error", error.message);
    return;
  }
  const fromName = profile?.username ?? "Someone";
  void notifyUser(friendId, {
    title: "Friend request",
    body: `${fromName} wants to be friends`,
    data: { type: "friend_request", fromId: user.id },
  });
};

  const acceptRequest = async (friendshipId: string) => {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId);
    if (error) Alert.alert("Error", error.message);
  };

  const renderFriend = ({ item }: { item: FriendRow }) => {
    const friendProfile = getProfile(item.friendId);
    const display = getAvatarDisplay(friendProfile, c.primary);
    const loc = locations[item.friendId];
    const online = isOnline(item.friendId);
    const batteryLevel = loc?.battery_level ?? null;
    const isCharging = loc?.is_charging ?? false;

    return (
      <View
        style={[
          styles.row,
          { backgroundColor: c.surface, borderColor: c.border },
        ]}
      >
        <View style={styles.avatarWrap}>
          {display.imageUri ? (
            <Image
              source={{ uri: display.imageUri }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[styles.avatar, { backgroundColor: display.color }]}
            >
              <Text style={styles.avatarText}>{display.initial}</Text>
            </View>
          )}
          {item.status === "accepted" && (
            <View
              style={[
                styles.onlineDot,
                {
                  backgroundColor: online ? c.success : c.icon,
                  borderColor: c.surface,
                },
              ]}
            />
          )}
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: c.text }]}>
            {friendProfile?.username ?? "…"}
          </Text>
          <Text style={[styles.meta, { color: c.textSecondary }]}>
            {item.status === "accepted"
              ? online
                ? "Online now"
                : "Offline"
              : item.direction === "incoming"
                ? "Wants to be friends"
                : "Request sent"}
          </Text>
        </View>
        {item.status === "accepted" && (
          <View style={styles.powerWrap}>
            <Ionicons
              name={
                isCharging ? "battery-charging-outline" : "battery-half-outline"
              }
              size={20}
              color={isCharging ? c.success : c.icon}
            />
            <Text
              style={[
                styles.powerText,
                { color: isCharging ? c.success : c.textSecondary },
              ]}
            >
              {batteryLevel != null ? `${batteryLevel}%` : "—"}
            </Text>
          </View>
        )}
        {item.direction === "incoming" && item.status === "pending" && (
          <Button
            title="Accept"
            onPress={() => acceptRequest(item.id)}
            style={{ height: 36, paddingHorizontal: 14 }}
            textStyle={{ fontSize: 13 }}
          />
        )}
        {item.direction === "outgoing" && item.status === "pending" && (
          <Ionicons name="time-outline" size={22} color={c.icon} />
        )}
      </View>
    );
  };

  const renderDiscover = ({ item }: { item: Profile }) => {
    const display = getAvatarDisplay(item, c.success);

    return (
      <View
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
          <Text style={[styles.name, { color: c.text }]}>{item.username}</Text>
          <Text
            style={[styles.meta, { color: c.textSecondary }]}
            numberOfLines={1}
          >
            {item.email}
          </Text>
        </View>
        <Pressable
          onPress={() => sendRequest(item.id)}
          style={[styles.addBtn, { backgroundColor: c.primary }]}
        >
          <Ionicons name="person-add" size={18} color="#fff" />
        </Pressable>
      </View>
    );
  };

  const loading = friendsLoading || discoverLoading;
  const listPadding = { paddingBottom: tabBarHeight + Spacing.lg };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: c.background }]}
      edges={["top"]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Friends</Text>
      </View>

      <View style={[styles.tabs, { backgroundColor: c.inputBg }]}>
        <Pressable
          onPress={() => setTab("friends")}
          style={[
            styles.tab,
            tab === "friends" && { backgroundColor: c.surface },
          ]}
        >
          <Text
            style={{
              color: tab === "friends" ? c.primary : c.textSecondary,
              fontWeight: "600",
              fontSize: FontSizes.sm,
            }}
          >
            My Friends
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("discover")}
          style={[
            styles.tab,
            tab === "discover" && { backgroundColor: c.surface },
          ]}
        >
          <Text
            style={{
              color: tab === "discover" ? c.primary : c.textSecondary,
              fontWeight: "600",
              fontSize: FontSizes.sm,
            }}
          >
            Discover
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
      ) : tab === "friends" ? (
        <FlatList
          data={friends}
          keyExtractor={(i) => i.id}
          renderItem={renderFriend}
          contentContainerStyle={[styles.list, listPadding]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="No friends yet"
              subtitle="Go to Discover and send friend requests. Once accepted, their live location appears on the Map."
            />
          }
        />
      ) : (
        <FlatList
          data={allUsers}
          keyExtractor={(i) => i.id}
          renderItem={renderDiscover}
          contentContainerStyle={[styles.list, listPadding]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No users found"
              subtitle="When other people create accounts they will appear here."
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
  tabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.xxl,
    borderRadius: Radii.md,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRadius: Radii.sm,
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
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 18,
  },
  onlineDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  info: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  name: {
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  meta: {
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  powerWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.sm,
  },
  powerText: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});