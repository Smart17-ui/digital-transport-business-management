import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/text';
import { colors, radius, space, TAP_TARGET, type } from '@/lib/theme';

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

/** A titled part of a screen, with an optional small action on the right. */
export function Section(props: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionHeadingText} accessibilityRole="header">
          {props.title}
        </Text>
        {props.action ? (
          <Pressable
            onPress={props.action.onPress}
            accessibilityRole="button"
            hitSlop={12}
            style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}
          >
            <Icon name="plus" size={16} />
            <Text style={styles.sectionActionText}>{props.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {props.children}
    </View>
  );
}

/** One line in a list inside a Card. With onPress it opens something and shows a chevron. */
export function ListRow(props: {
  title: string;
  detail?: string;
  icon?: IconName;
  right?: ReactNode;
  first?: boolean;
  onPress?: () => void;
  danger?: boolean;
}) {
  const content = (
    <>
      {props.icon ? <Icon name={props.icon} size={20} color={props.danger ? colors.owes : colors.muted} /> : null}
      <View style={styles.rowText}>
        <Text style={[styles.listTitle, props.danger && styles.listTitleDanger]}>{props.title}</Text>
        {props.detail ? <Text style={styles.listDetail}>{props.detail}</Text> : null}
      </View>
      {props.right}
      {props.onPress ? <Icon name="chevronRight" size={18} color={colors.borderStrong} /> : null}
    </>
  );
  const style = [styles.listRow, !props.first && styles.listRowDivider];
  return props.onPress ? (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      style={({ pressed }) => [...style, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

type Tone = 'ok' | 'waiting' | 'problem' | 'neutral';

const TONES: Record<Tone, { background: string; color: string }> = {
  ok: { background: colors.owedSoft, color: colors.owed },
  waiting: { background: colors.waitingSoft, color: colors.waiting },
  problem: { background: colors.owesSoft, color: colors.owes },
  neutral: { background: colors.tint, color: colors.muted },
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
  icon?: IconName;
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
      {props.icon ? <Icon name={props.icon} size={18} /> : null}
      <Text style={[styles.buttonText, props.compact && styles.buttonTextCompact]}>{props.label}</Text>
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
        {props.note ? <Text style={styles.listDetail}>{props.note}</Text> : null}
      </View>
      <Text style={[styles.rowValue, props.strong && styles.strong, props.color ? { color: props.color } : null]}>
        {props.value}
      </Text>
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Icon name="info" size={18} color={colors.muted} />
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

/** A plain message for when a list has nothing in it yet, with the next thing to do. */
export function EmptyState(props: { title: string; detail?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <Card style={styles.empty}>
      <Text style={styles.listTitle}>{props.title}</Text>
      {props.detail ? <Text style={styles.emptyDetail}>{props.detail}</Text> : null}
      {props.action ? (
        <View style={styles.emptyAction}>
          <Button label={props.action.label} onPress={props.action.onPress} />
        </View>
      ) : null}
    </Card>
  );
}

export function ScreenLoading() {
  return (
    <View style={styles.centre}>
      <ActivityIndicator size="large" color={colors.muted} />
    </View>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card style={styles.problem}>
      <Text style={styles.noteText}>{message}</Text>
      <Button compact variant="secondary" label="Try again" onPress={onRetry} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space(4),
  },
  sectionTitle: { ...type.heading, color: colors.text, marginTop: space(6), marginBottom: space(2) },
  section: { marginTop: space(6) },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(2) },
  sectionHeadingText: { ...type.heading, color: colors.text },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  sectionActionText: { ...type.body, fontWeight: '600', color: colors.text },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 60, paddingHorizontal: space(4), paddingVertical: space(3) },
  listRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listTitle: { ...type.body, fontWeight: '600', color: colors.text },
  listTitleDanger: { color: colors.owes },
  listDetail: { ...type.small, color: colors.muted, marginTop: 2 },
  pill: { paddingHorizontal: space(2.5), paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  button: { flexDirection: 'row', gap: space(2), borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  buttonFull: { minHeight: TAP_TARGET, paddingHorizontal: space(4), alignSelf: 'stretch' },
  buttonCompact: { minHeight: 40, paddingHorizontal: space(3.5) },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
  buttonText: { ...type.heading, color: colors.primaryText },
  buttonTextCompact: { fontSize: 14, lineHeight: 20 },
  bottom: {
    paddingHorizontal: space(4),
    paddingTop: space(3),
    gap: space(2),
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { flex: 1 },
  rowLabel: { ...type.body, color: colors.text },
  rowValue: { ...type.body, fontWeight: '500', color: colors.text, fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '700' },
  note: {
    flexDirection: 'row',
    gap: space(2.5),
    backgroundColor: colors.tint,
    borderRadius: radius.control,
    padding: space(3.5),
    marginTop: space(4),
  },
  noteText: { flex: 1, ...type.small, color: colors.text },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDark: { backgroundColor: colors.dark },
  avatarText: { fontSize: 15, fontWeight: '700', color: colors.text },
  avatarTextDark: { color: colors.onDark },
  empty: { alignItems: 'stretch', paddingVertical: space(5) },
  emptyDetail: { ...type.small, color: colors.muted, marginTop: space(1) },
  emptyAction: { marginTop: space(4) },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6) },
  problem: { gap: space(3), marginTop: space(4), alignItems: 'flex-start' },
});
