import { Colors, FontSizes, Radii, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TextInput, View } from "react-native";

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search…",
}: Props) {
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: c.inputBg, borderColor: c.border },
      ]}
    >
      <Ionicons name="search" size={18} color={c.textSecondary} />
      <TextInput
        style={[styles.input, { color: c.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textSecondary}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.xxl,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: 1,
    gap: Spacing.sm,
    minHeight: 42,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.md,
    paddingVertical: Spacing.sm,
  },
});