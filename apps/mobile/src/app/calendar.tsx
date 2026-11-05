import { markForDate, monthWeeks, type DayMark } from '@dt/domain';
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/text';
import { Card, ListRow, LoadError, Pill, ScreenLoading, Section } from '@/components/ui';
import { formatDay, formatDaySpan, kwacha, localDate } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { fetchCalendar, reportKindLabel, useScreenData } from '@/lib/business';
import { colors, radius, space, themedStyles, type } from '@/lib/theme';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const MARKS: Record<Exclude<DayMark, 'none'>, { label: string; background: string; color: string }> = {
  paid: { label: 'Paid', background: colors.owedSoft, color: colors.owed },
  owed: { label: 'Money owed', background: colors.owesSoft, color: colors.owes },
  waiting: { label: 'Report to answer', background: colors.waitingSoft, color: colors.waiting },
  excused: { label: 'Report accepted', background: colors.tint, color: colors.text },
};

const STATUS_PILL = {
  pending: { label: 'Waiting for owner', tone: 'waiting' },
  accepted: { label: 'Accepted', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'problem' },
} as const;

export default function Calendar() {
  const { account } = useAuth();
  const business = account?.business;
  const isOwner = business?.role === 'owner';
  const load = useCallback(() => fetchCalendar(business?.id ?? ''), [business?.id]);
  const { data, failed, refreshing, reload } = useScreenData(load);

  const today = localDate();
  const [month, setMonth] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const [selected, setSelected] = useState(today);

  const move = (by: number) => {
    const zeroBased = month.year * 12 + (month.month - 1) + by;
    setMonth({ year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 });
  };

  const daysOn = (date: string) => data?.days.filter((d) => d.serviceDate === date) ?? [];
  const reportsOn = (date: string) => data?.reports.filter((r) => r.serviceDate === date) ?? [];
  const markFor = (date: string) =>
    markForDate({ daysLeft: daysOn(date).map((d) => d.left), reportStatuses: reportsOn(date).map((r) => r.status) });

  const selectedDays = daysOn(selected);
  const selectedReports = reportsOn(selected);

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <Stack.Screen options={{ title: 'Calendar' }} />
      {failed && !data ? <LoadError message="Could not load the calendar. Check your signal and try again." onRetry={reload} /> : null}
      {!data && !failed ? <ScreenLoading /> : null}

      {data ? (
        <>
          <Card style={styles.calendar}>
            <View style={styles.monthRow}>
              <Pressable onPress={() => move(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={12} style={styles.back}>
                <Icon name="chevronRight" size={20} />
              </Pressable>
              <Text style={styles.month} accessibilityRole="header">
                {MONTHS[month.month - 1]} {month.year}
              </Text>
              <Pressable onPress={() => move(1)} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={12}>
                <Icon name="chevronRight" size={20} />
              </Pressable>
            </View>

            <View style={styles.week}>
              {WEEKDAYS.map((day) => (
                <Text key={day} style={styles.weekday}>
                  {day}
                </Text>
              ))}
            </View>

            {monthWeeks(month.year, month.month).map((week, i) => (
              <View key={i} style={styles.week}>
                {week.map((date, j) => {
                  if (!date) return <View key={j} style={styles.cell} />;
                  const mark = markFor(date);
                  const style = mark === 'none' ? null : MARKS[mark];
                  const chosen = date === selected;
                  return (
                    <Pressable
                      key={date}
                      onPress={() => setSelected(date)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: chosen }}
                      accessibilityLabel={`${formatDay(date)}${style ? `, ${style.label}` : ''}`}
                      style={[
                        styles.cell,
                        styles.dateCell,
                        style && { backgroundColor: style.background },
                        date === today && styles.today,
                        chosen && styles.chosen,
                      ]}
                    >
                      <Text style={[styles.date, style && { color: style.color }, (date === today || chosen) && styles.dateStrong]}>
                        {Number(date.slice(8))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <View style={styles.legend}>
              {Object.values(MARKS).map((mark) => (
                <View key={mark.label} style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: mark.background, borderColor: mark.color }]} />
                  <Text style={styles.legendText}>{mark.label}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Section title={formatDay(selected)}>
            {selectedDays.length + selectedReports.length === 0 ? (
              <Card>
                <Text style={styles.empty}>Nothing recorded on this day.</Text>
              </Card>
            ) : (
              <Card style={styles.list}>
                {selectedReports.map((report, i) => (
                  <View key={report.id} style={[styles.report, i > 0 && styles.divider]}>
                    <View style={styles.reportHeading}>
                      <Text style={styles.reportTitle}>{reportKindLabel(report.kind)}</Text>
                      <Pill {...STATUS_PILL[report.status]} />
                    </View>
                    <Text style={styles.reportDetail}>
                      {[report.plate, isOwner ? report.driverName : null].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.reportBody}>{report.reason}</Text>
                    {report.decisionReason ? <Text style={styles.reportDetail}>Owner: {report.decisionReason}</Text> : null}
                    {isOwner && report.status === 'pending' ? (
                      <Pressable onPress={() => router.push({ pathname: '/check-report', params: { report: report.id } })} accessibilityRole="button" hitSlop={8}>
                        <Text style={styles.link}>Answer this report</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {selectedDays.map((day, i) => (
                  <ListRow
                    key={day.id}
                    first={i === 0 && selectedReports.length === 0}
                    title={isOwner ? `${day.plate} · ${day.driverName ?? 'Former driver'}` : day.plate}
                    detail={[
                      formatDaySpan(day.startedAt, day.endedAt),
                      day.left === 0 ? null : day.left > 0 ? `${kwacha(day.left)} owed by the driver` : `${kwacha(-day.left)} owed by the owner`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={() => router.push({ pathname: '/day-settlement', params: { day: day.id, plate: day.plate } })}
                  />
                ))}
              </Card>
            )}
          </Section>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  content: { padding: space(4), paddingBottom: space(8) },
  calendar: { padding: space(3) },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(1), marginBottom: space(3) },
  back: { transform: [{ rotate: '180deg' }] },
  month: { ...type.heading, color: colors.text },
  week: { flexDirection: 'row', gap: space(1), marginBottom: space(1) },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 16, color: colors.muted },
  cell: { flex: 1, aspectRatio: 1 },
  dateCell: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.control - 4 },
  today: { borderWidth: 1, borderColor: colors.borderStrong },
  chosen: { borderWidth: 2, borderColor: colors.primary },
  date: { fontSize: 14, lineHeight: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  dateStrong: { fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3), marginTop: space(3), paddingHorizontal: space(1) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  legendText: { fontSize: 12, lineHeight: 16, color: colors.muted },
  empty: { ...type.small, color: colors.muted },
  list: { padding: 0, overflow: 'hidden' },
  report: { padding: space(4), gap: space(1) },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  reportHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  reportTitle: { ...type.body, fontWeight: '600', color: colors.text },
  reportDetail: { ...type.small, color: colors.muted },
  reportBody: { ...type.body, color: colors.text },
  link: { ...type.small, fontWeight: '600', color: colors.text, textDecorationLine: 'underline', marginTop: space(1) },
}));
