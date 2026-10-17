import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';

import { getBaseUrl, useHealth, useSources, type SourceHealth } from '@/api';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { GradientButton } from '@/components/ui/GradientButton';
import { haptics } from '@/lib/haptics';
import { toast, useSettings } from '@/store';
import { colors, fonts, layout, radii, spacing } from '@/theme';

import { HealthDot } from './HealthDot';

const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

const STATUS_LABEL: Record<SourceHealth, string> = {
  up: 'Aktif',
  down: 'Gangguan',
  unknown: 'Tidak diketahui',
};

/** Adds `http://` when the scheme is missing and drops trailing slashes. */
function normalizeInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

export interface ServerSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * "Alamat server" editor. Mount it with a fresh `key` each time it opens so the draft
 * re-initialises from the current setting without an effect.
 */
export function ServerSheet({ visible, onClose }: ServerSheetProps) {
  const qc = useQueryClient();
  const setServerUrl = useSettings((s) => s.setServerUrl);
  const [draft, setDraft] = useState(() => useSettings.getState().serverUrl ?? getBaseUrl());
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);

  const health = useHealth();
  const sources = useSources();
  const refetchHealth = health.refetch;
  const refetchSources = sources.refetch;

  const normalized = normalizeInput(draft);
  const valid = URL_PATTERN.test(normalized);
  const showError = touched && !valid;

  const rows = useMemo(() => {
    const names = new Map((sources.data ?? []).map((s) => [s.id, s.name]));
    const statuses = health.data?.sources ?? {};
    const ids = Object.keys(statuses).length > 0 ? Object.keys(statuses) : [...names.keys()];
    return ids.map((id) => ({
      id,
      name: names.get(id) ?? id,
      status: (statuses[id] ?? 'unknown') as SourceHealth,
    }));
  }, [sources.data, health.data]);

  const checking = health.isFetching || sources.isFetching;

  const recheck = () => {
    haptics.light();
    void refetchHealth();
    void refetchSources();
  };

  const save = () => {
    setTouched(true);
    if (!valid) {
      haptics.error();
      return;
    }
    // The draft is prefilled with the discovered address: saving it untouched would pin it as an override.
    if (useSettings.getState().serverUrl === null && normalized === getBaseUrl()) {
      onClose();
      return;
    }
    const before = getBaseUrl();
    setServerUrl(normalized);
    // A changed base URL already resets the queries (queryClient.ts); only re-fetch when it did not.
    if (getBaseUrl() === before) void qc.invalidateQueries();
    toast.success('Alamat server disimpan');
    onClose();
  };

  const reset = () => {
    const before = getBaseUrl();
    setServerUrl(null);
    if (getBaseUrl() === before) void qc.invalidateQueries();
    toast.success('Alamat server diatur otomatis');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Alamat server" heightRatio={0.8}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.field}>
            <TextInput
              value={draft}
              onChangeText={(t) => {
                setDraft(t);
                setTouched(true);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={save}
              placeholder="http://192.168.1.10:3030"
              placeholderTextColor={colors.textMuted}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="done"
              selectionColor={colors.primary}
              accessibilityLabel="Alamat server"
              accessibilityHint="Masukkan alamat server, misalnya http://192.168.1.10:3030"
              style={[
                styles.input,
                focused && styles.inputFocused,
                showError && styles.inputError,
                Platform.OS === 'web' ? ({ outlineWidth: 0 } as TextStyle) : null,
              ]}
            />
            {showError ? (
              <AppText variant="bodySm" color="danger" accessibilityLiveRegion="polite">
                {draft.trim() ? 'Alamat tidak valid. Gunakan format http://host:port.' : 'Alamat server tidak boleh kosong.'}
              </AppText>
            ) : (
              <AppText variant="bodySm" color="textMuted">
                Contoh: http://192.168.1.10:3030
              </AppText>
            )}
          </View>

          <View style={styles.actions}>
            <GradientButton label="Simpan" onPress={save} fullWidth disabled={touched && !valid} />
            <GradientButton label="Reset ke otomatis" variant="secondary" onPress={reset} fullWidth />
          </View>

          <View style={styles.statusSection}>
            <View style={styles.statusHeader}>
              <AppText variant="overline" color="textMuted">
                Status sumber
              </AppText>
              <Pressable
                onPress={recheck}
                disabled={checking}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Periksa ulang status sumber"
                style={styles.recheck}>
                <AppText variant="label" color={checking ? 'textMuted' : 'primary'}>
                  {checking ? 'Memeriksa…' : 'Periksa ulang'}
                </AppText>
              </Pressable>
            </View>

            <View style={styles.statusCard}>
              {rows.length === 0 ? (
                <View style={styles.statusRow}>
                  <HealthDot status={checking ? 'loading' : health.isError ? 'down' : 'unknown'} />
                  <AppText variant="bodySm" color="textSecondary" style={styles.statusName}>
                    {checking ? 'Memeriksa server…' : health.isError ? 'Server tidak terjangkau' : 'Belum ada data sumber'}
                  </AppText>
                </View>
              ) : (
                rows.map((row, i) => (
                  <View key={row.id}>
                    {i > 0 && <View aria-hidden style={styles.separator} />}
                    <View
                      style={styles.statusRow}
                      accessible
                      accessibilityLabel={`${row.name}, ${STATUS_LABEL[row.status]}`}>
                      <AppText variant="title" style={styles.statusName} numberOfLines={1}>
                        {row.name}
                      </AppText>
                      <View style={styles.statusValue}>
                        <HealthDot status={row.status} />
                        <AppText
                          variant="bodySm"
                          color={row.status === 'up' ? 'success' : row.status === 'down' ? 'danger' : 'textMuted'}>
                          {STATUS_LABEL[row.status]}
                        </AppText>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { gap: spacing[5], paddingBottom: spacing[4] },
  field: { gap: spacing[2] },
  input: {
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  inputFocused: { borderColor: colors.primary },
  inputError: { borderColor: colors.danger },
  actions: { gap: spacing[3] },
  statusSection: { gap: spacing[2] },
  statusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recheck: { minHeight: 32, justifyContent: 'center' },
  statusCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  statusRow: {
    minHeight: layout.minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  statusName: { flex: 1 },
  statusValue: { flexDirection: 'row', alignItems: 'center', gap: spacing[1.5] },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing[4] },
});
