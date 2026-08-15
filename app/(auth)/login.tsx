import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusModal } from "@/components/ui/StatusModal";
import { Colors, FontSizes, Radii, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Link, router } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{
    visible: boolean;
    type: "success" | "error";
    title: string;
    message: string;
  }>({ visible: false, type: "success", title: "", message: "" });

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setModal({
        visible: true,
        type: "error",
        title: "Missing fields",
        message: "Please enter both email and password.",
      });
      return;
    }
    setLoading(true);
    const { error } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);

    if (error) {
      setModal({
        visible: true,
        type: "error",
        title: "Login failed",
        message: error,
      });
    } else {
      setModal({
        visible: true,
        type: "success",
        title: "Welcome back!",
        message: "You have signed in successfully.",
      });
    }
  };

  const onModalClose = () => {
    const wasSuccess = modal.type === "success";
    setModal((m) => ({ ...m, visible: false }));
    if (wasSuccess) {
      router.replace("/(app)/map");
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo area */}
          <View style={styles.logoArea}>
            <Image
              source={require("@/assets/images/app-logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={[styles.appName, { color: c.text }]}>
              Realtime Location
            </Text>
            <Text style={[styles.tagline, { color: c.textSecondary }]}>
              Share your live position & chat with friends
            </Text>
          </View>

          {/* Form */}
          <View
            style={[
              styles.card,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <Text style={[styles.heading, { color: c.text }]}>Sign in</Text>

            <Input
              label="Email"
              leftIcon="mail-outline"
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
            <Input
              label="Password"
              leftIcon="lock-closed-outline"
              rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
              onRightIconPress={() => setShowPassword((prev) => !prev)}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />

            <Button
              title="Sign in"
              onPress={handleLogin}
              loading={loading}
              style={{ marginTop: Spacing.sm }}
            />

            <View style={styles.footerRow}>
              <Text style={{ color: c.textSecondary, fontSize: FontSizes.sm }}>
                Don&apos;t have an account?{" "}
              </Text>
              <Link href="/(auth)/signup" asChild>
                <Pressable>
                  <Text
                    style={{
                      color: c.primary,
                      fontWeight: "600",
                      fontSize: FontSizes.sm,
                    }}
                  >
                    Create one
                  </Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <StatusModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={onModalClose}
        buttonText={modal.type === "success" ? "Go to Dashboard" : "Try again"}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.xxl,
    justifyContent: "center",
  },
  logoArea: {
    alignItems: "center",
    marginBottom: Spacing.xxxl,
  },
  logoImage: {
    width: 110,
    height: 110,
    borderRadius: 28,
    marginBottom: Spacing.lg,
  },
  appName: {
    fontSize: FontSizes.xxl,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: FontSizes.sm,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  card: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    padding: Spacing.xxl,
  },
  heading: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    marginBottom: Spacing.xl,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.xl,
  },
});
