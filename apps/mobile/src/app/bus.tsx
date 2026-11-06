import { currentDayForVehicle, lastFinishedDayForVehicle, summariseDay } from '@dt/domain';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { DayActivity } from '@/components/day-activity';
import { DayStatusPill, dayDetail, daySentNote, km } from '@/components/home-parts';
import { Text } from '@/components/text';
import { Button, Card, EmptyState, ListRow, LoadError, MoneyRow, Pill, ScreenLoading, Section } from '@/components/ui';
import { describeCosts, describeTerms, formatDay, kwacha, localDate, type ArrangementRecord } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { fetchBusRecord, useOwnerOverview, useScreenData, vehicleTypeLabel } from '@/lib/business';
import { colors, space, themedStyles, type } from '@/lib/theme';

function StatusPill({ status }: { status: ArrangementRecord['status'] }) {
  if (status === 'active') return <Pill label="Agreed" tone="ok" />;
  if (status === 'proposed') return <Pill label="Waiting for driver" tone="waiting" />;
  return <Pill label="Declined" tone="problem" />;
}

export default function BusDetail() {
  const { bus: busId } = useLocalSearchParams<{ bus: string }>();
  const { account } = useAuth();
  const businessId = account?.business?.id ?? '';
  const { data: overview, failed, refreshing, reload } = useOwnerOverview(businessId);
  const loadRecord = useCallback(() => fetchBusRecord(businessId, busId), [businessId, busId]);
  const { data: record } = useScreenData(loadRecord);

  const bus = overview?.buses.find((b) => b.id === busId);
  const title = <Stack.Screen options={{ title: bus?.plate ?? 'Bus' }} />;
  if (!overview || !bus) {
    return (
      <View style={styles.flex}>
        {title}
        {failed ? (
          <View style={styles.content}>
            <LoadError message="Could not load this bus. Check your signal and try again." onRetry={reload} />
          </View>
        ) : (
          <ScreenLoading />
        )}
      </View>
    );
  }

  const day = currentDayForVehicle(overview.days, bus.id, localDate());
  const last = lastFinishedDayForVehicle(overview.days, bus.id);
  const settlementDay = day ?? last;
  const arrangements = overview.arrangements.filter((a) => a.vehicleId === bus.id);
  const assigned = arrangements.some((a) => a.status !== 'declined');
  const entries = day ? overview.entries.filter((e) => e.tripDayId === day.id) : [];
  const costs = day ? overview.costs.filter((c) => c.tripDayId === day.id) : [];
  const summary = day ? summariseDay(entries, costs, day.id) : null;
  const assign = () => router.push({ pathname: '/assign', params: { bus: bus.id } });
  const withWaiting = (amount: number, waiting: number) =>
    waiting > 0 ? `${kwacha(amount)} (${kwacha(waiting)} to check)` : kwacha(amount);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
    >
      {title}
      <Card style={styles.settlement}>
        <ListRow first icon="map" title="See on the map" onPress={() => router.push({ pathname: '/map', params: { bus: bus.id } })} />
      </Card>
      <Section title="Today">
        {day && summary ? (
          <Card style={styles.dayCard}>
            <View style={styles.dayHeading}>
              <Text style={styles.detail}>{dayDetail(day)}</Text>
              <DayStatusPill day={day} />
            </View>
            {daySentNote(day) ? <Text style={styles.detail}>{daySentNote(day)}</Text> : null}
            <MoneyRow label="Takings" value={withWaiting(summary.takings, summary.takingsWaiting)} />
            <MoneyRow label="Costs from the cash" value={kwacha(summary.costsFromCash)} />
            <MoneyRow label="Handed to you" value={withWaiting(summary.handedOver, summary.handedOverWaiting)} last />
            <DayActivity viewer="owner" entries={entries} costs={costs} />
          </Card>
        ) : (
          <Card>
            <Text style={styles.detail}>No day started yet today.</Text>
          </Card>
        )}
        {settlementDay ? (
          <Card style={styles.settlement}>
            <ListRow
              first
              title={day ? 'See cashing' : 'Last cashing'}
              detail={formatDay(settlementDay.serviceDate)}
              onPress={() =>
                router.push({ pathname: '/day-settlement', params: { day: settlementDay.id, plate: bus.plate } })
              }
            />
          </Card>
        ) : null}
      </Section>

      <Section title="Driver and agreement" action={assigned ? { label: 'New', onPress: assign } : undefined}>
        {arrangements.length === 0 ? (
          overview.drivers.length === 0 ? (
            <EmptyState
              title="No drivers yet"
              detail="Invite a driver first, then you can give them this bus."
              action={{ label: 'Invite a driver', onPress: () => router.push('/invite') }}
            />
          ) : (
            <EmptyState
              title="No driver on this bus"
              detail="Choose a driver and offer them the terms."
              action={{ label: 'Assign a driver', onPress: assign }}
            />
          )
        ) : (
          <>
            {arrangements.map((a) => (
              <Card key={a.id} style={styles.agreement}>
                <View style={styles.dayHeading}>
                  <Text style={styles.driver}>{overview.drivers.find((d) => d.id === a.driverId)?.name ?? 'Driver'}</Text>
                  <StatusPill status={a.status} />
                </View>
                <Text style={styles.detail}>{describeTerms(a.type, a.terms, 'owner')}</Text>
                <Text style={styles.detail}>{describeCosts(a.fuelBearer, a.otherCostsBearer, 'owner')}</Text>
                {a.declineReason ? <Text style={styles.detail}>Reason: {a.declineReason}</Text> : null}
              </Card>
            ))}
            {!assigned ? (
              <View style={styles.assign}>
                <Button label="Assign a driver" onPress={assign} />
              </View>
            ) : null}
          </>
        )}
      </Section>

      <Section title="About this bus">
        <Card style={styles.rows}>
          <MoneyRow label="Number plate" value={bus.plate} />
          <MoneyRow label="Type" value={vehicleTypeLabel(bus.type)} />
          <MoneyRow label="Added" value={formatDay(bus.addedAt.slice(0, 10))} last={!record} />
          {record ? (
            <>
              <MoneyRow label="Days finished" value={String(record.daysWorked)} />
              <MoneyRow label="Last worked" value={record.lastWorked ? formatDay(record.lastWorked) : 'Not yet'} />
              <MoneyRow label="Distance driven" value={km(record.distance)} />
              <MoneyRow label="Last odometer reading" value={record.lastOdometer === null ? 'None yet' : km(record.lastOdometer)} last />
            </>
          ) : null}
        </Card>
      </Section>
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  rows: { paddingVertical: space(1) },
  dayCard: { paddingVertical: space(3) },
  dayHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2), marginBottom: space(1) },
  detail: { flexShrink: 1, ...type.small, color: colors.muted, marginTop: 2 },
  settlement: { padding: 0, overflow: 'hidden', marginTop: space(3) },
  agreement: { marginBottom: space(2.5) },
  driver: { flexShrink: 1, ...type.heading, color: colors.text },
  assign: { marginTop: space(1) },
}));
