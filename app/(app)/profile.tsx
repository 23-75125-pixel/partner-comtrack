import { Button } from "@/components/ui/Button";
import { Colors, FontSizes, Radii, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useProfiles } from "@/contexts/ProfilesContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { AVATAR_COLORS, parseAvatarColor } from "@/lib/avatar";
import { Profile, supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const { upsertLocal } = useProfiles();
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];
  const { height: tabBarHeight } = useTabBarHeight();

  const [username, setUsername] = useState(profile?.username ?? "");
  const [color, setColor] = useState(parseAvatarColor(profile?.avatar_url));
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);

  useEffect(() => {
    setUsername(profile?.username ?? "");
    setColor(parseAvatarColor(profile?.avatar_url));

    const stored = profile?.avatar_url ?? null;
    if (
      stored &&
      (stored.startsWith("http://") ||
        stored.startsWith("https://") ||
        stored.startsWith("file:") ||
        stored.startsWith("content:"))
    ) {
      setAvatarUri(stored);
    } else {
      setAvatarUri(null);
    }
  }, [profile]);

  const handlePickAvatar = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photos to choose a profile picture.",
      );
      return;
    }

    setPickingImage(true);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    setPickingImage(false);

    if (!result.canceled && result.assets?.[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const uploadAvatarToSupabase = async (imageUri: string) => {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();

      const fileExtension = (
        imageUri.split("?")[0].split(".").pop() || "jpg"
      ).toLowerCase();
      const normalizedExtension = ["png", "jpg", "jpeg", "webp"].includes(
        fileExtension,
      )
        ? fileExtension
        : "jpg";

      const filePath = `${user!.id}/avatar-${Date.now()}.${normalizedExtension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, blob, {
          upsert: true,
          contentType: blob.type || "image/jpeg",
          cacheControl: "3600",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      console.warn("Avatar upload error:", error);
      return null;
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const name = username.trim();
    if (!name) {
      Alert.alert("Username required", "Please enter a username.");
      return;
    }
    if (name.length < 2) {
      Alert.alert("Too short", "Username must be at least 2 characters.");
      return;
    }

    setSaving(true);

    try {
      let finalAvatarUrl = avatarUri ?? `color:${color}`;

      const isLocalImage =
        avatarUri &&
        !/^https?:\/\//i.test(avatarUri) &&
        !/^data:/i.test(avatarUri);
      if (isLocalImage) {
        const uploadedUrl = await uploadAvatarToSupabase(avatarUri);
        if (!uploadedUrl) {
          Alert.alert(
            "Upload failed",
            "Your photo could not be uploaded to Supabase Storage. Please try again.",
          );
          setSaving(false);
          return;
        }
        finalAvatarUrl = uploadedUrl;
      }

      const payload = {
        id: user.id,
        email: user.email ?? profile?.email ?? null,
        username: name,
        avatar_url: finalAvatarUrl,
      };

      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (error) {
        const message = error.message.toLowerCase();
        Alert.alert(
          "Error",
          message.includes("username")
            ? "Profile save failed because the Supabase table is missing the username column. Please run the SQL in SUPABASE_SCHEMA.sql."
            : message.includes("profiles")
              ? "Profile save failed. Please check your Supabase schema and run the SQL from SUPABASE_SCHEMA.sql."
              : message.includes("unique")
                ? "That username is already taken."
                : error.message,
        );
        setSaving(false);
        return;
      }

      // Update the shared cache immediately — every screen showing this
      // avatar (chat, map, friends list) reflects it right away, and the
      // realtime subscription keeps other devices/sessions in sync too.
      const savedProfile: Profile = {
        id: payload.id,
        email: payload.email ?? profile?.email ?? "",
        username: payload.username,
        avatar_url: payload.avatar_url,
        created_at: profile?.created_at ?? new Date().toISOString(),
      };
      upsertLocal(savedProfile);
      await refreshProfile();
      setSaving(false);
      Alert.alert(
        "Saved",
        "Your profile was updated. Friends will see your new avatar and username on the map.",
      );
    } catch (error) {
      console.warn("Profile save failed:", error);
      setSaving(false);
      Alert.alert("Error", "Something went wrong while saving your profile.");
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const initial = (username || profile?.username || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: c.background }]}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: tabBarHeight + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.text }]}>Profile</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            Customize how friends see you on the map
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.border },
          ]}
        >
          <Pressable onPress={handlePickAvatar} disabled={pickingImage}>
            <View
              style={[
                styles.avatarPreview,
                { backgroundColor: avatarUri ? "transparent" : color },
              ]}
            >
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </View>
          </Pressable>

          <Text style={[styles.previewName, { color: c.text }]}>
            {username || "Your name"}
          </Text>
          <Text style={[styles.previewHint, { color: c.textSecondary }]}>
            {pickingImage ? "Selecting photo…" : "Map preview"}
          </Text>
        </View>

        <Text style={[styles.label, { color: c.textSecondary }]}>Username</Text>
        <View
          style={[
            styles.inputRow,
            { backgroundColor: c.inputBg, borderColor: c.border },
          ]}
        >
          <Ionicons name="person-outline" size={20} color={c.icon} />
          <TextInput
            style={[styles.input, { color: c.text }]}
            value={username}
            onChangeText={setUsername}
            placeholder="Display name"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="none"
            maxLength={24}
          />
        </View>

        <Text
          style={[
            styles.label,
            { color: c.textSecondary, marginTop: Spacing.xl },
          ]}
        >
          Avatar color
        </Text>
        <View style={styles.colorGrid}>
          {AVATAR_COLORS.map((hex) => {
            const selected = color.toLowerCase() === hex.toLowerCase();
            return (
              <Pressable
                key={hex}
                onPress={() => {
                  setAvatarUri(null);
                  setColor(hex);
                }}
                style={[
                  styles.colorDot,
                  { backgroundColor: hex },
                  selected && styles.colorDotSelected,
                ]}
              >
                {selected ? (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Button
          title="Save profile"
          onPress={handleSave}
          loading={saving}
          style={{ marginTop: Spacing.xxl }}
        />

        <View
          style={[
            styles.section,
            { backgroundColor: c.surface, borderColor: c.border },
          ]}
        >
          <View style={styles.row}>
            <Ionicons name="mail-outline" size={20} color={c.icon} />
            <Text style={[styles.rowLabel, { color: c.textSecondary }]}>
              Email
            </Text>
            <Text
              style={[styles.rowValue, { color: c.text }]}
              numberOfLines={1}
            >
              {profile?.email ?? user?.email ?? "—"}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.row}>
            <Ionicons name="id-card-outline" size={20} color={c.icon} />
            <Text style={[styles.rowLabel, { color: c.textSecondary }]}>
              User ID
            </Text>
            <Text
              style={[styles.rowValue, { color: c.text }]}
              numberOfLines={1}
            >
              {user?.id?.slice(0, 8)}…
            </Text>
          </View>
        </View>

        <Button
          title="Sign out"
          onPress={handleSignOut}
          variant="danger"
          style={{ marginTop: Spacing.xl, marginBottom: Spacing.xxxl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.xxl,
  },
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: FontSizes.sm,
    marginTop: Spacing.xs,
  },
  card: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    padding: Spacing.xxxl,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarPreview: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#fff",
    position: "relative",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 55,
  },
  avatarText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 38,
  },
  cameraBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  previewName: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
  },
  previewHint: {
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: "500",
    marginBottom: Spacing.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.md,
    height: "100%",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  colorDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  section: {
    marginTop: Spacing.xxl,
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  rowLabel: {
    flex: 1,
    fontSize: FontSizes.sm,
  },
  rowValue: {
    fontSize: FontSizes.sm,
    fontWeight: "500",
    maxWidth: 160,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
});
