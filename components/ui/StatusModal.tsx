import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, FontSizes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Button } from './Button';

type Props = {
  visible: boolean;
  type: 'success' | 'error';
  title: string;
  message: string;
  onClose: () => void;
  buttonText?: string;
};

export function StatusModal({
  visible,
  type,
  title,
  message,
  onClose,
  buttonText = 'Continue',
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const isSuccess = type === 'success';

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: c.overlay }]} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: c.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: isSuccess ? `${c.success}18` : `${c.error}18` },
            ]}
          >
            <Ionicons
              name={isSuccess ? 'checkmark-circle' : 'close-circle'}
              size={48}
              color={isSuccess ? c.success : c.error}
            />
          </View>
          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          <Text style={[styles.message, { color: c.textSecondary }]}>{message}</Text>
          <Button title={buttonText} onPress={onClose} style={{ width: '100%', marginTop: Spacing.lg }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: Radii.xl,
    padding: Spacing.xxxl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSizes.md,
    textAlign: 'center',
    lineHeight: 22,
  },
});
