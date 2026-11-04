import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import type { DayView } from '@dt/domain';
import { Text } from '@/components/text';
import { Avatar, Card, ListRow, Pill, Section } from '@/components/ui';
import { formatDay, localDate } from '@/lib/arrangements';
import { useAuth, type Account } from '@/lib/auth';
import { colors, space, type } from '@/lib/theme';

export type Business = NonNullable<Account['business']>;

export function km(reading: number): string {
  return `${reading.toLocaleString('en-US')} km`;
}

/** The business and who is signed in, at the top of a home screen. */
export function HomeHeader({ business, roleLabel }: { business: Business; roleLabel: string }) {
  const { account } = useAuth();
  const insets = useSafeAreaInsets();
  const initials = business.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

  return (
    <View style={[styles.header, { paddingTop: insets.top + space(4) }]}>
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1}>
          {business.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {roleLabel} · {account?.displayName}
        </Text>
      </View>
      <Avatar initials={initials} dark />
    </View>
  );
}

/** The links that live at the bottom of both home screens. */
export function MoreSection() {
  const { signOut } = useAuth();
  return (
    <Section title="More">
      <Card style={styles.list}>
        <ListRow first icon="clock" title="Past days" onPress={() => router.push('/history')} />
        <ListRow icon="logOut" title="Sign out" onPress={signOut} />
      </Card>
    </Section>
  );
}

export function DayStatusPill({ day }: { day: DayView }) {
  if (day.unsent) return <Pill label="Not sent yet" tone="neutral" />;
  return day.odometerEnd === null ? <Pill label="Day running" tone="ok" /> : <Pill label="Day finished" tone="neutral" />;
}

/** Odometer facts about a day, in one short line. */
export function dayDetail(day: DayView): string {
  const started = day.serviceDate === localDate() ? '' : `Started ${formatDay(day.serviceDate)} · `;
  return day.odometerEnd === null
    ? `${started}Started at ${km(day.odometerStart)}`
    : `${started}Drove ${km(day.odometerEnd - day.odometerStart)}`;
}

export function HomeBody({ children }: { children: ReactNode }) {
  return <View style={styles.body}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  name: { ...type.title, color: colors.text },
  subtitle: { ...type.small, color: colors.muted, marginTop: 2 },
  list: { padding: 0, overflow: 'hidden' },
  body: { paddingHorizontal: space(4) },
});
