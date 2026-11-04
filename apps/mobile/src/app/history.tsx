import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/text';
import { Button, Card, Pill, ScreenLoading } from '@/components/ui';
import { formatDay, kwacha } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { fetchHistory, useScreenData, type HistoryDay } from '@/lib/business';
import { colors, space } from '@/lib/theme';

const SHOWN_AT_ONCE = 30;

function DayPill({ day, isOwner }: { day: HistoryDay; isOwner: boolean }) {
  if (day.left > 0) return <Pill label={`${kwacha(day.left)} ${isOwner ? 'owed to you' : 'to pay'}`} tone="waiting" />;
  if (day.left < 0) return <Pill label={`${kwacha(-day.left)} ${isOwner ? 'you owe' : 'owed to you'}`} tone="waiting" />;
  return <Pill label={day.owedForDay === 0 ? 'Nothing owed' : 'Paid up'} tone="ok" />;
}

export default function History() {
  const { account } = useAuth();
  const business = account?.business;
  const isOwner = business?.role === 'owner';
  const load = useCallback(() => fetchHistory(business?.id ?? ''), [business?.id]);
  const { data: days, failed, refreshing, reload } = useScreenData(load);
  const [shown, setShown] = useState(SHOWN_AT_ONCE);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
    >
      <Stack.Screen options={{ title: 'Past days' }} />
      {failed && !days ? (
        <View style={styles.problem}>
          <Text style={styles.message}>Could not load past days. Check your signal and try again. If your signal is fine, the problem is on our side.</Text>
          <Button variant="secondary" label="Try again" onPress={reload} />
        </View>
      ) : null}
      {!days && !failed ? <ScreenLoading /> : null}
      {days && days.length === 0 ? <Text style={styles.message}>No finished days yet.</Text> : null}
      {days && days.length > 0 ? (
        <>
          <Text style={styles.intro}>Payments count against the oldest money owed first, so older days clear first.</Text>
          <Card style={styles.list}>
            {days.slice(0, shown).map((day, i) => (
              <Pressable
                key={day.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/day-settlement', params: { day: day.id, plate: day.plate } })}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.date}>{formatDay(day.serviceDate)}</Text>
                  <Text style={styles.detail}>
                    {day.plate}
                    {isOwner ? ` · ${day.driverName ?? 'Former driver'}` : ''}
                    {day.distance === null ? '' : ` · ${day.distance.toLocaleString('en-US')} km`}
                  </Text>
                  <View style={styles.pill}>
                    <DayPill day={day} isOwner={isOwner} />
                  </View>
                </View>
                <Icon name="chevronRight" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </Card>
          {days.length > shown ? (
            <View style={styles.more}>
              <Button variant="secondary" label="Show older days" onPress={() => setShown(shown + SHOWN_AT_ONCE)} />
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  problem: { gap: space(3) },
  message: { fontSize: 15, lineHeight: 22, color: colors.text },
  intro: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: space(3) },
  list: { paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(3.5) },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  date: { fontSize: 16, fontWeight: '700', color: colors.text },
  detail: { fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 2 },
  pill: { flexDirection: 'row', marginTop: space(1.5) },
  more: { marginTop: space(3) },
});
