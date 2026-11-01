import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { useSample } from '@/lib/sample';
import { colors, radius, space, TAP_TARGET } from '@/lib/theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

type Tone = 'ok' | 'waiting' | 'problem' | 'neutral';

const TONES: Record<Tone, { background: string; color: string }> = {
  ok: { background: colors.primarySoft, color: colors.primary },
  waiting: { background: colors.waitingSoft, color: colors.waiting },
  problem: { background: colors.owesSoft, color: colors.owes },
  neutral: { background: colors.border, color: colors.muted },
};

export function Pill({ label, tone }: { label: string; tone: Tone }) {
  const { background, color } = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  compact?: boolean;
}) {
  const primary = (props.variant ?? 'primary') === 'primary';
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      style={({ pressed }) => [
        styles.button,
        props.compact ? styles.buttonCompact : styles.buttonFull,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        props.disabled && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, primary ? styles.buttonTextPrimary : styles.buttonTextSecondary]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/** Keeps the main action in reach of the thumb, above the phone's own buttons. */
export function BottomActions({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bottom, { paddingBottom: insets.bottom + space(3) }]}>{children}</View>;
}

export function MoneyRow(props: {
  label: string;
  value: string;
  note?: string;
  color?: string;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !props.last && styles.rowDivider]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, props.strong && styles.strong]}>{props.label}</Text>
        {props.note ? <Text style={styles.rowNote}>{props.note}</Text> : null}
      </View>
      <Text style={[styles.rowValue, props.strong && styles.strong, props.color ? { color: props.color } : null]}>
        {props.value}
      </Text>
    </View>
  );
}

export function ProgressBar({ part, whole }: { part: number; whole: number }) {
  const percent = whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${percent}%` }]} />
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Icon name="info" size={20} color={colors.primary} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

export function Avatar({ initials, dark }: { initials: string; dark?: boolean }) {
  return (
    <View style={[styles.avatar, dark && styles.avatarDark]}>
      <Text style={[styles.avatarText, dark && styles.avatarTextDark]}>{initials}</Text>
    </View>
  );
}

export function OfflineBanner() {
  const { offline } = useSample();
  if (!offline) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Icon name="offline" size={20} color={colors.waiting} />
      <Text style={styles.offlineText}>No signal. Saved on your phone, and sent when signal returns.</Text>
    </View>
  );
}

/** Marks the screens as sample data, and holds the controls for trying them. */
export function SampleBar({ showOffline }: { showOffline?: boolean }) {
  const { offline, setOffline } = useSample();
  return (
    <View style={styles.sampleBar}>
      <Text style={styles.sampleText}>Sample data</Text>
      {showOffline ? (
        <View style={styles.sampleSwitch}>
          <Text style={styles.sampleText}>Try no signal</Text>
          <Switch value={offline} onValueChange={setOffline} accessibilityLabel="Try no signal" />
        </View>
      ) : null}
      <Pressable onPress={() => router.dismissTo('/')} accessibilityRole="button" hitSlop={12}>
        <Text style={styles.sampleLink}>Switch role</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: space(6), marginBottom: space(2.5) },
  pill: { paddingHorizontal: space(2.5), paddingVertical: space(1), borderRadius: radius.pill },
  pillText: { fontSize: 13, fontWeight: '700' },
  button: { borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  buttonFull: { minHeight: TAP_TARGET + 4, paddingHorizontal: space(4), alignSelf: 'stretch' },
  buttonCompact: { minHeight: 44, paddingHorizontal: space(4) },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.muted },
  buttonDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextPrimary: { color: colors.primaryText },
  buttonTextSecondary: { color: colors.text },
  bottom: {
    paddingHorizontal: space(4),
    paddingTop: space(3),
    gap: space(2),
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, color: colors.text },
  rowNote: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rowValue: { fontSize: 16, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '800' },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  note: {
    flexDirection: 'row',
    gap: space(2.5),
    backgroundColor: colors.primarySoft,
    borderRadius: radius.control,
    padding: space(3.5),
    marginTop: space(4),
  },
  noteText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDark: { backgroundColor: colors.text },
  avatarText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  avatarTextDark: { color: colors.surface },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: colors.waitingSoft,
    paddingHorizontal: space(4),
    paddingVertical: space(2.5),
  },
  offlineText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.waiting },
  sampleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(2),
    minHeight: 40,
    paddingHorizontal: space(4),
    backgroundColor: colors.border,
  },
  sampleSwitch: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  sampleText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  sampleLink: { fontSize: 12, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
});
