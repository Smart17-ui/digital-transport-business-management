import { sum } from '@dt/domain';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { Avatar, Button, Card, Pill, SampleBar, SectionTitle } from '@/components/ui';
import { BUSES, busById, money, TODAY, useSample } from '@/lib/sample';
import { colors, radius, space } from '@/lib/theme';

export default function OwnerHome() {
  const insets = useSafeAreaInsets();
  const { dayFor, entriesFor } = useSample();

  const running = BUSES.filter((b) => b.offRoadReason === null);
  const days = running.map((b) => dayFor(b.id, 'owner'));
  const total = (pick: (d: (typeof days)[number]) => number) => sum(days.map(pick));
  const toConfirm = BUSES.flatMap((b) => entriesFor(b.id, 'owner')).filter((e) => e.status === 'pending');

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ height: insets.top, backgroundColor: colors.border }} />
      <SampleBar />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space(6) }]}>
        <View style={styles.header}>
          <Avatar initials="BT" dark />
          <View style={styles.flex}>
            <Text style={styles.name}>Banda Transport</Text>
            <Text style={styles.detail}>Owner · {BUSES.length} buses · {TODAY}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Takings today · {running.length} of {BUSES.length} buses</Text>
          <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
            {money(total((d) => d.takings))}
          </Text>
          <View style={styles.heroStats}>
            <HeroStat label="You received" value={money(total((d) => d.receivedByOwner))} />
            <HeroStat label="To confirm" value={money(total((d) => d.waitingToConfirm))} />
            <HeroStat label="Still owed" value={money(total((d) => Math.max(d.left, 0)))} />
          </View>
        </View>

        <SectionTitle>Needs you</SectionTitle>
        {toConfirm.length === 0 ? (
          <Card style={styles.done}>
            <Icon name="check" color={colors.primary} />
            <Text style={styles.doneText}>Nothing to confirm right now.</Text>
          </Card>
        ) : (
          <Card style={styles.list}>
            {toConfirm.map((e, i) => {
              const bus = busById(e.busId);
              return (
                <View key={e.id} style={[styles.needs, i > 0 && styles.divider]}>
                  <View style={styles.needsIcon}>
                    <Icon name="clock" size={22} color={colors.waiting} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.needsTitle}>
                      {e.kind === 'remittance'
                        ? `${bus.driver} handed you ${money(e.amount)}`
                        : `${bus.driver} collected ${money(e.amount)}`}
                    </Text>
                    <Text style={styles.detail}>{bus.plate} · {e.time}</Text>
                  </View>
                  <Button
                    compact
                    label="Check"
                    onPress={() => router.push({ pathname: '/confirm', params: { entry: e.id } })}
                  />
                </View>
              );
            })}
          </Card>
        )}

        <SectionTitle>Fleet today</SectionTitle>
        <Card style={styles.list}>
          {BUSES.map((bus, i) => {
            if (bus.offRoadReason) {
              return (
                <View key={bus.id} style={[styles.fleet, i > 0 && styles.divider]}>
                  <View style={styles.flex}>
                    <Text style={styles.plate}>{bus.plate}</Text>
                    <Text style={styles.detail}>{bus.offRoadReason}</Text>
                  </View>
                  <Pill label="Off-road" tone="waiting" />
                </View>
              );
            }
            const day = dayFor(bus.id, 'owner');
            return (
              <Pressable
                key={bus.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/settlement', params: { bus: bus.id, as: 'owner' } })}
                style={({ pressed }) => [styles.fleet, i > 0 && styles.divider, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.plate}>{bus.plate}</Text>
                  <Text style={styles.detail}>{bus.driver} · {bus.arrangementLabel}</Text>
                </View>
                <View style={styles.fleetRight}>
                  <Text style={styles.fleetAmount}>{money(day.takings)}</Text>
                  <Text style={day.left > 0 ? styles.fleetOwed : styles.fleetPaid}>
                    {day.left > 0 ? `${money(day.left)} still owed` : 'Paid up'}
                  </Text>
                </View>
                <Icon name="chevronRight" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
        </Card>
      </ScrollView>
    </View>
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4) },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(4) },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  detail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  hero: { backgroundColor: colors.primary, borderRadius: radius.card, padding: space(5) },
  heroLabel: { fontSize: 15, fontWeight: '600', color: colors.onPrimaryMuted },
  heroAmount: { fontSize: 46, fontWeight: '800', color: colors.primaryText, marginVertical: space(2), fontVariant: ['tabular-nums'] },
  heroStats: { flexDirection: 'row', gap: space(3), borderTopWidth: 1, borderTopColor: colors.onPrimaryMuted, paddingTop: space(3) },
  heroStatLabel: { fontSize: 13, color: colors.onPrimaryMuted },
  heroStatValue: { fontSize: 18, fontWeight: '700', color: colors.primaryText, marginTop: 2, fontVariant: ['tabular-nums'] },
  done: { flexDirection: 'row', alignItems: 'center', gap: space(2.5) },
  doneText: { fontSize: 15, color: colors.text },
  list: { paddingVertical: 0 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  needs: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3.5) },
  needsIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: colors.waitingSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needsTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  fleet: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(3.5) },
  pressed: { opacity: 0.6 },
  plate: { fontSize: 16, fontWeight: '700', color: colors.text },
  fleetRight: { alignItems: 'flex-end' },
  fleetAmount: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  fleetOwed: { fontSize: 13, fontWeight: '600', color: colors.waiting, marginTop: 2 },
  fleetPaid: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 2 },
});
