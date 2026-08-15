import { Colors, FontSizes, Radii, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    View,
} from "react-native";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
};

export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  style,
  ...props
}: Props) {
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: c.textSecondary }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: c.inputBg,
            borderColor: error ? c.error : c.border,
          },
        ]}
      >
        {leftIcon ? (
          <Ionicons
            name={leftIcon}
            size={20}
            color={c.icon}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          placeholderTextColor={c.textSecondary}
          style={[styles.input, { color: c.text }, style]}
          {...props}
        />
        {rightIcon ? (
          <Pressable onPress={onRightIconPress} hitSlop={10}>
            <Ionicons
              name={rightIcon}
              size={20}
              color={c.icon}
              style={styles.rightIcon}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: c.error }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.lg },
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
  },
  icon: { marginRight: Spacing.sm },
  rightIcon: { marginLeft: Spacing.sm },
  input: {
    flex: 1,
    fontSize: FontSizes.md,
    height: "100%",
  },
  error: {
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
  },
});
