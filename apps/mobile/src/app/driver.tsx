import type { EntryStatus } from '@dt/domain';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { Avatar, Card, OfflineBanner, Pill, ProgressBar, SampleBar, SectionTitle } from '@/components/ui';
import { busById, CONDUCTOR, money, useSample, type Entry } from '@/lib/sample';
import { colors, radius, space } from '@/lib/theme';

const BUS_ID = 'baf';

export default function DriverHome() {
  const insets = useSafeAreaInsets();
  const { dayFor, entriesFor } = useSample();
  const bus = busById(BUS_ID);
  const day = dayFor(BUS_ID, 'driver');

  const timeline = [
    ...entriesFor(BUS_ID, 'driver').map((e) => ({
      key: e.id,
      time: e.time,
      label: e.kind === 'remittance' ? 'You → Owner' : `${CONDUCTOR} → You`,
      amount: money(e.amount),
      pill: entryPill(e),
    })),
    ...bus.expenses.map((x) => ({
      key: x.id,
      time: x.time,
      label: x.litres ? `${x.label} · ${x.litres} L` : x.label,
      amount: `- ${money(x.amount)}`,
      pill: null,
    })),
  ].sort((a, b) => b.time.localeCompare(a.time));

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ height: insets.top, backgroundColor: colors.border }} />
      <SampleBar showOffline />
      <OfflineBanner />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space(6) }]}>
        <View style={styles.header}>
          <Avatar initials="JM" />
          <View style={styles.flex}>
            <Text style={styles.name}>Joseph Mwale</Text>
            <Text style={styles.detail}>Driver · {bus.plate}</Text>
          </View>
          <Pill label="Day running" tone="ok" />
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Cash in your hand</Text>
          <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
            {money(day.cashInHand)}
          </Text>
          <Text style={styles.heroNote}>
            {money(day.takings)} collected − {money(day.costsPaidFromCash)} spent − {money(day.handedOver)} to owner
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/settlement', params: { bus: BUS_ID, as: 'driver' } })}
          style={({ pressed }) => [styles.owed, pressed && styles.pressed]}
        >
          <View style={styles.owedTop}>
            <Text style={styles.owedTitle}>
              {day.left > 0 ? `${money(day.left)} left to pay the owner` : 'Nothing left to pay the owner'}
            </Text>
            <Icon name="chevronRight" size={20} color={colors.muted} />
          </View>
          <ProgressBar part={day.handedOver} whole={day.owedTotal} />
          <Text style={styles.owedNote}>
            {money(day.handedOver)} of {money(day.owedTotal)} handed over · You keep {money(day.driverKeeps)}
          </Text>
        </Pressable>

        <View style={styles.actions}>
          <Action
            icon="arrowDown"
            label="Cash from conductor"
            primary
            onPress={() => router.push({ pathname: '/handover', params: { kind: 'takings' } })}
          />
          <Action
            icon="arrowUp"
            label="Pay owner"
            onPress={() => router.push({ pathname: '/handover', params: { kind: 'remittance' } })}
          />
        </View>

        <SectionTitle>Today</SectionTitle>
        <Card style={styles.list}>
          {timeline.map((item, i) => (
            <View key={item.key} style={[styles.item, i > 0 && styles.divider]}>
              <Text style={styles.time}>{item.time}</Text>
              <View style={styles.flex}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                {item.pill ? <View style={styles.itemPill}>{item.pill}</View> : null}
              </View>
              <Text style={styles.itemAmount}>{item.amount}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

function entryPill(e: Entry) {
  if (!e.sent) return <Pill label="Saved, not sent yet" tone="neutral" />;
  const pills: Record<EntryStatus, { label: string; tone: 'ok' | 'waiting' | 'problem' }> = {
    pending: { label: 'Waiting for owner', tone: 'waiting' },
    confirmed: { label: 'Confirmed', tone: 'ok' },
    disputed: { label: 'Disputed', tone: 'problem' },
  };
  return <Pill {...pills[e.status]} />;
}

function Action(props: { icon: IconName; label: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [styles.action, props.primary && styles.actionPrimary, pressed && styles.pressed]}
    >
      <Icon name={props.icon} color={props.primary ? colors.primaryText : colors.text} />
      <Text style={[styles.actionText, props.primary && styles.actionTextPrimary]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4) },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(4) },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  detail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  hero: { backgroundColor: colors.dark, borderRadius: radius.card, padding: space(5) },
  heroLabel: { fontSize: 15, fontWeight: '600', color: colors.onDarkMuted },
  heroAmount: { fontSize: 46, fontWeight: '800', color: colors.onDark, marginVertical: space(1), fontVariant: ['tabular-nums'] },
  heroNote: { fontSize: 13, color: colors.onDarkMuted },
  owed: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space(4),
    marginTop: space(3),
    gap: space(2.5),
  },
  owedTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  owedTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  owedNote: { fontSize: 13, color: colors.muted },
  pressed: { opacity: 0.7 },
  actions: { flexDirection: 'row', gap: space(3), marginTop: space(3) },
  action: {
    flex: 1,
    minHeight: 92,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space(3.5),
    justifyContent: 'space-between',
    gap: space(2),
  },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.text },
  actionTextPrimary: { color: colors.primaryText },
  list: { paddingVertical: 0 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  time: { fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  itemLabel: { fontSize: 15, color: colors.text },
  itemPill: { flexDirection: 'row', marginTop: space(1) },
  itemAmount: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
