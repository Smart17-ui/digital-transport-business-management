import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { sentLongAfter, type DayView } from '@dt/domain';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/text';
import { Avatar, Pill } from '@/components/ui';
import { formatDay, formatDaySpan, formatTime, localDate } from '@/lib/arrangements';
import { useAuth, type Account } from '@/lib/auth';
import { colors, radius, space, themedStyles, type } from '@/lib/theme';

export type Business = NonNullable<Account['business']>;

/** Opens the phone's dialler with the number filled in. `phone` is as stored, without the plus. */
export function callPhone(phone: string): void {
  void Linking.openURL(`tel:+${phone}`);
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function km(reading: number): string {
  return `${reading.toLocaleString('en-US')} km`;
}

/** The business and who is signed in, at the top of a home screen. */
export function HomeHeader({ business, roleLabel }: { business: Business; roleLabel: string }) {
  const { account } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + space(4) }]}>
      <Avatar initials={initialsOf(business.name)} green />
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1}>
          {business.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {roleLabel} · {account?.displayName}
        </Text>
      </View>
      <Pressable
        onPress={() => router.push('/settings')}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={8}
        style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
      >
        <Icon name="settings" size={22} />
      </Pressable>
    </View>
  );
}

function QuickLink({ icon, label, href }: { icon: IconName; label: string; href: '/calendar' | '/history' }) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.quickLink, pressed && styles.pressed]}
    >
      <View style={styles.quickLinkIcon}>
        <Icon name={icon} size={20} color={colors.owed} />
      </View>
      <Text style={styles.quickLinkLabel}>{label}</Text>
    </Pressable>
  );
}

/** The screens reached from both home screens. */
export function QuickLinks() {
  return (
    <View style={styles.quickLinks}>
      <QuickLink icon="calendar" label="Calendar" href="/calendar" />
      <QuickLink icon="clock" label="Past days" href="/history" />
    </View>
  );
}

export function DayStatusPill({ day }: { day: DayView }) {
  if (day.unsent) return <Pill label="Not sent yet" tone="neutral" />;
  return day.odometerEnd === null ? <Pill label="Day running" tone="ok" /> : <Pill label="Day finished" tone="neutral" />;
}

/** When a day ran and how far, in one short line. */
export function dayDetail(day: DayView): string {
  const parts = [
    day.serviceDate === localDate() ? '' : formatDay(day.serviceDate),
    formatDaySpan(day.startedAt, day.endedAt),
    day.odometerEnd === null ? `From ${km(day.odometerStart)}` : `Drove ${km(day.odometerEnd - day.odometerStart)}`,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** For the owner: says when a start or end reached the server long after the phone's time. */
export function daySentNote(day: Pick<DayView, 'startedAt' | 'endedAt' | 'startSentAt' | 'endSentAt'>): string | null {
  const notes = [
    sentLongAfter(day.startedAt, day.startSentAt) ? `Start sent at ${formatTime(day.startSentAt)}` : '',
    sentLongAfter(day.endedAt, day.endSentAt) ? `End sent at ${formatTime(day.endSentAt)}` : '',
  ].filter(Boolean);
  return notes.length > 0 ? `${notes.join(' · ')}. Times above are from the driver's phone.` : null;
}

export function HomeBody({ children }: { children: ReactNode }) {
  return <View style={styles.body}>{children}</View>;
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  name: { ...type.title, color: colors.text },
  subtitle: { ...type.small, color: colors.muted, marginTop: 2 },
  pressed: { opacity: 0.6 },
  settings: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quickLinks: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
  quickLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    minHeight: 64,
    padding: space(3),
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quickLinkIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.owedSoft,
  },
  quickLinkLabel: { ...type.small, flexShrink: 1, fontWeight: '600', color: colors.text },
  body: { paddingHorizontal: space(4) },
}));
