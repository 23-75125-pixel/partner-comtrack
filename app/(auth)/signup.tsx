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

export default function SignupScreen() {
  const { signUp } = useAuth();
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];

  const [username, setUsername] = useState("");
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

  const handleSignup = async () => {
    if (!username.trim() || !email.trim() || !password) {
      setModal({
        visible: true,
        type: "error",
        title: "Missing fields",
        message: "Please fill in username, email and password.",
      });
      return;
    }
    if (password.length < 6) {
      setModal({
        visible: true,
        type: "error",
        title: "Weak password",
        message: "Password must be at least 6 characters.",
      });
      return;
    }

    setLoading(true);
    const { error } = await signUp(
      email.trim().toLowerCase(),
      password,
      username.trim(),
    );
    setLoading(false);

    if (error) {
      setModal({
        visible: true,
        type: "error",
        title: "Sign up failed",
        message: error,
      });
    } else {
      setModal({
        visible: true,
        type: "success",
        title: "Account created!",
        message: "You can now sign in and start sharing your location.",
      });
    }
  };

  const onModalClose = () => {
    const wasSuccess = modal.type === "success";
    setModal((m) => ({ ...m, visible: false }));
    if (wasSuccess) {
      router.replace("/(auth)/login");
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
          <View style={styles.logoArea}>
            <Image
              source={require("@/assets/images/app-logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={[styles.appName, { color: c.text }]}>
              Create account
            </Text>
            <Text style={[styles.tagline, { color: c.textSecondary }]}>
              Join friends and share live locations
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <Input
              label="Username"
              leftIcon="person-outline"
              placeholder="johndoe"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
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
              placeholder="Min. 6 characters"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />

            <Button
              title="Create account"
              onPress={handleSignup}
              loading={loading}
            />

            <View style={styles.footerRow}>
              <Text style={{ color: c.textSecondary, fontSize: FontSizes.sm }}>
                Already have an account?{" "}
              </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <Text
                    style={{
                      color: c.primary,
                      fontWeight: "600",
                      fontSize: FontSizes.sm,
                    }}
                  >
                    Sign in
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
        buttonText={modal.type === "success" ? "Go to Sign in" : "Try again"}
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
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.xl,
  },
});
