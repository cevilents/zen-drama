import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, spacing, typography } from '@/theme';

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  /** Clears the text and blurs. Shown as "Batal" while focused. */
  onCancel?: () => void;
  loading?: boolean;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

const WEB_INPUT_RESET = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

/** Rounded search input with clear button, inline spinner and a "Batal" action while focused. */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChangeText, onSubmit, onCancel, loading, placeholder = 'Cari judul, genre, atau pemeran', style },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <Ionicons name="search" size={19} color={focused ? colors.primary : colors.textMuted} />
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          enterKeyHint="search"
          inputMode="search"
          accessibilityLabel="Cari drama"
          style={[styles.input, WEB_INPUT_RESET]}
        />
        {loading && <ActivityIndicator size="small" color={colors.textMuted} />}
        {value.length > 0 && (
          <IconButton
            icon="close-circle"
            variant="ghost"
            size={32}
            iconSize={18}
            color={colors.textMuted}
            accessibilityLabel="Hapus teks pencarian"
            onPress={() => onChangeText('')}
          />
        )}
      </View>
      {(focused || value.length > 0) && onCancel && (
        <PressableScale onPress={onCancel} accessibilityLabel="Batal" hitSlop={10} style={styles.cancel}>
          <AppText variant="label" color="textSecondary">
            Batal
          </AppText>
        </PressableScale>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  field: {
    flex: 1,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingLeft: spacing[4],
    paddingRight: spacing[1.5],
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  input: {
    ...typography.body,
    flex: 1,
    height: '100%',
    color: colors.text,
    paddingVertical: 0,
  },
  cancel: { paddingVertical: spacing[2] },
});
