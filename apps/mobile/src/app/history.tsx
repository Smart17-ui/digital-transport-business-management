import { addDays, mondayOf } from '@dt/domain';
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Choice } from '@/components/form';
import { Icon } from '@/components/icons';
import { Text } from '@/components/text';
import { Button, Card, EmptyState, LoadError, ScreenLoading, Section } from '@/components/ui';
import { formatDay, formatDaySpan, kwacha, localDate } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { fetchHistory, useScreenData, type HistoryDay } from '@/lib/business';
import { colors, radius, space, themedStyles, type } from '@/lib/theme';

const SHOWN_AT_ONCE = 30;

const FILTERS = [
  { value: 'all', label: 'All days' },
  { value: 'owed', label: 'Money owed' },
] as const;

function weekday(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
}

function weekLabel(monday: string, thisMonday: string): string {
  if (monday === thisMonday) return 'This week';
  if (monday === addDays(thisMonday, -7)) return 'Last week';
  return `${formatDay(monday)} to ${formatDay(addDays(monday, 6))}`;
}

/** Newest week first, keeping the order the days arrive in. */
function byWeek(days: HistoryDay[]): { monday: string; days: HistoryDay[] }[] {
  const weeks: { monday: string; days: HistoryDay[] }[] = [];
  for (const day of days) {
    const monday = mondayOf(day.serviceDate);
    const week = weeks.find((w) => w.monday === monday);
    if (week) week.days.push(day);
    else weeks.push({ monday, days: [day] });
  }
  return weeks;
}

function DayStatus({ day }: { day: HistoryDay }) {
  if (day.left !== 0) {
    return (
      <View style={styles.status}>
        <Text style={styles.owedAmount}>{kwacha(Math.abs(day.left))}</Text>
        <Text style={styles.owedLabel}>{day.left > 0 ? 'owed by driver' : 'owed by owner'}</Text>
      </View>
    );
  }
  return <Text style={day.owedForDay === 0 ? styles.nothingOwed : styles.paid}>{day.owedForDay === 0 ? 'Nothing owed' : 'Paid'}</Text>;
}

export default function History() {
  const { account } = useAuth();
  const business = account?.business;
  const isOwner = business?.role === 'owner';
  const load = useCallback(() => fetchHistory(business?.id ?? ''), [business?.id]);
  const { data: days, failed, refreshing, reload } = useScreenData(load);
  const [shown, setShown] = useState(SHOWN_AT_ONCE);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all');

  const thisMonday = mondayOf(localDate());
  const matching = (days ?? []).filter((day) => filter === 'all' || day.left !== 0);
  const owedByDriver = (days ?? []).reduce((total, day) => total + Math.max(day.left, 0), 0);
  const owedByOwner = (days ?? []).reduce((total, day) => total + Math.max(-day.left, 0), 0);
  const distance = (days ?? []).reduce((total, day) => total + (day.distance ?? 0), 0);
  const daysOwing = (days ?? []).filter((day) => day.left !== 0).length;

  const headline =
    owedByDriver > 0
      ? { label: isOwner ? 'Your drivers owe you' : 'You owe the owner', amount: owedByDriver }
      : owedByOwner > 0
        ? { label: isOwner ? 'You owe your drivers' : 'The owner owes you', amount: owedByOwner }
        : { label: 'Nothing is owed', amount: 0 };

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <Stack.Screen options={{ title: 'Past days' }} />
      {failed && !days ? (
        <LoadError message="Could not load past days. Check your signal and try again. If your signal is fine, the problem is on our side." onRetry={reload} />
      ) : null}
      {!days && !failed ? <ScreenLoading /> : null}
      {days && days.length === 0 ? (
        <EmptyState title="No finished days yet" detail="Each day appears here once the driver ends it." />
      ) : null}

      {days && days.length > 0 ? (
        <>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>{headline.label}</Text>
            <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
              {kwacha(headline.amount)}
            </Text>
            <View style={styles.heroStats}>
              <HeroStat label="Days worked" value={String(days.length)} />
              <HeroStat label="Distance" value={`${distance.toLocaleString('en-US')} km`} />
              <HeroStat label="Days owing" value={String(daysOwing)} />
            </View>
          </View>

          <View style={styles.filter}>
            <Choice options={FILTERS} value={filter} onChange={setFilter} />
          </View>

          {matching.length === 0 ? <EmptyState title="No days with money owed" detail="Every finished day is paid up." /> : null}

          {byWeek(matching.slice(0, shown)).map((week) => (
            <Section key={week.monday} title={weekLabel(week.monday, thisMonday)}>
              <Card style={styles.list}>
                {week.days.map((day, i) => (
                  <Pressable
                    key={day.id}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/day-settlement', params: { day: day.id, plate: day.plate } })}
                    style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
                  >
                    <View style={styles.dateTile}>
                      <Text style={styles.tileWeekday}>{weekday(day.serviceDate)}</Text>
                      <Text style={styles.tileDay}>{Number(day.serviceDate.slice(8))}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.title} numberOfLines={1}>
                        {day.plate}
                        {isOwner ? ` · ${day.driverName ?? 'Former driver'}` : ''}
                      </Text>
                      <Text style={styles.detail} numberOfLines={1}>
                        {[formatDaySpan(day.startedAt, day.endedAt), day.distance === null ? '' : `${day.distance.toLocaleString('en-US')} km`]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <DayStatus day={day} />
                    <Icon name="chevronRight" size={18} color={colors.borderStrong} />
                  </Pressable>
                ))}
              </Card>
            </Section>
          ))}

          {matching.length > shown ? (
            <View style={styles.more}>
              <Button variant="secondary" label="Show older days" onPress={() => setShown(shown + SHOWN_AT_ONCE)} />
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.flex}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text style={styles.heroStatValue} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: space(4), paddingBottom: space(8) },
  hero: { backgroundColor: colors.hero, borderRadius: radius.card, padding: space(5) },
  heroLabel: { ...type.small, color: colors.onDarkMuted },
  heroAmount: { ...type.display, color: colors.onDark, marginTop: space(1), fontVariant: ['tabular-nums'] },
  heroStats: {
    flexDirection: 'row',
    gap: space(3),
    marginTop: space(4),
    paddingTop: space(3.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.onDarkMuted,
  },
  heroStatLabel: { ...type.small, color: colors.onDarkMuted },
  heroStatValue: { ...type.heading, color: colors.onDark, marginTop: 2, fontVariant: ['tabular-nums'] },
  filter: { marginTop: space(4), marginBottom: -space(4) },
  list: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 68, paddingHorizontal: space(3.5), paddingVertical: space(3) },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  dateTile: { width: 44, height: 44, borderRadius: radius.control - 2, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  tileWeekday: { fontSize: 11, lineHeight: 14, color: colors.muted },
  tileDay: { fontSize: 16, lineHeight: 20, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  title: { ...type.body, fontWeight: '600', color: colors.text },
  detail: { ...type.small, color: colors.muted, marginTop: 2 },
  status: { alignItems: 'flex-end' },
  owedAmount: { ...type.body, fontWeight: '600', color: colors.owes, fontVariant: ['tabular-nums'] },
  owedLabel: { fontSize: 11, lineHeight: 14, color: colors.muted },
  paid: { ...type.small, fontWeight: '600', color: colors.owed },
  nothingOwed: { ...type.small, color: colors.muted },
  more: { marginTop: space(4) },
}));
