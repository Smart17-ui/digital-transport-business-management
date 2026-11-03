import {
  applyQueuedDayCommands,
  applyQueuedEntries,
  currentDayForVehicle,
  lastFinishedDayForVehicle,
  summariseDay,
  type DayCost,
  type DayEntry,
  type DayView,
} from '@dt/domain';
import { router, Stack } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayActivity } from '@/components/day-activity';
import { Avatar, Button, Card, MoneyRow, Note, Pill, SectionTitle } from '@/components/ui';
import { describeCosts, describeTerms, formatDay, kwacha, localDate, type ArrangementRecord } from '@/lib/arrangements';
import { useAuth, type Account } from '@/lib/auth';
import { busTypeLabel, useDriverOverview, useOwnerOverview, type Bus, type Driver } from '@/lib/business';
import { reasonForCode } from '@/lib/commands';
import { useCommandQueue } from '@/lib/queue';
import { colors, radius, space } from '@/lib/theme';

type Business = NonNullable<Account['business']>;

/** Each person gets the home for their role in their business. */
export default function Home() {
  const { account, userId } = useAuth();
  const business = account?.business;
  if (!business || !userId) return null;
  return business.role === 'owner' ? <OwnerHome business={business} /> : <DriverHome business={business} userId={userId} />;
}

function km(reading: number): string {
  return `${reading.toLocaleString('en-US')} km`;
}

const REFUSED_TITLE: Record<string, string> = {
  start_day: 'Your day could not be started',
  end_day: 'Your day could not be ended',
  record_handover: 'Your cash entry was not accepted',
  log_expense: 'Your cost was not accepted',
};

/** The way into a day's settlement: the day on screen, otherwise the bus's last finished one. */
function SettlementLink(props: { day: DayView | null; last: DayView | null; plate: string }) {
  const target = props.day ?? props.last;
  // A day only on this phone has no settlement on the server yet.
  if (!target || target.unsent) return null;
  const label = !props.day
    ? `Last settlement (${formatDay(target.serviceDate)})`
    : target.odometerEnd === null
      ? 'See settlement so far'
      : 'See settlement';
  return (
    <View style={styles.action}>
      <Button
        variant="secondary"
        label={label}
        onPress={() => router.push({ pathname: '/day-settlement', params: { day: target.id, plate: props.plate } })}
      />
    </View>
  );
}

function OwnerHome({ business }: { business: Business }) {
  const insets = useSafeAreaInsets();
  const { data: overview, failed, refreshing, reload } = useOwnerOverview(business.id);
  const buses = overview?.buses ?? [];
  const drivers = overview?.drivers ?? [];
  const arrangements = overview?.arrangements ?? [];

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(6) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Header business={business} roleLabel="Owner" />
      {failed ? <LoadProblem onRetry={reload} /> : null}

      {overview ? (
        <>
          {overview.toCheck.length + overview.paymentsToCheck.length > 0 ? (
            <>
              <SectionTitle>Needs you</SectionTitle>
              <Card style={styles.list}>
                {overview.paymentsToCheck.map((payment, i) => (
                  <View key={payment.id} style={[styles.row, styles.needs, i > 0 && styles.divider]}>
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle}>
                        {drivers.find((d) => d.id === payment.driverId)?.name ?? 'Your driver'} says they paid you {kwacha(payment.amount)}
                      </Text>
                      <Text style={styles.detail}>For {formatDay(payment.serviceDate)}</Text>
                    </View>
                    <Button
                      compact
                      label="Check"
                      onPress={() =>
                        router.push({
                          pathname: '/day-settlement',
                          params: {
                            day: payment.tripDayId,
                            plate: buses.find((b) => b.id === payment.vehicleId)?.plate ?? '',
                          },
                        })
                      }
                    />
                  </View>
                ))}
                {overview.toCheck.map(({ entry, vehicleId, driverId }, i) => {
                  const driver = drivers.find((d) => d.id === driverId)?.name ?? 'Your driver';
                  const plate = buses.find((b) => b.id === vehicleId)?.plate;
                  return (
                    <View
                      key={entry.id}
                      style={[styles.row, styles.needs, (i > 0 || overview.paymentsToCheck.length > 0) && styles.divider]}
                    >
                      <View style={styles.flex}>
                        <Text style={styles.rowTitle}>
                          {entry.kind === 'remittance'
                            ? `${driver} handed you ${kwacha(entry.amount)}`
                            : `${driver} collected ${kwacha(entry.amount)}`}
                        </Text>
                        {plate ? <Text style={styles.detail}>{plate}</Text> : null}
                      </View>
                      <Button
                        compact
                        label="Check"
                        onPress={() => router.push({ pathname: '/check-cash', params: { entry: entry.id } })}
                      />
                    </View>
                  );
                })}
              </Card>
            </>
          ) : null}

          <SectionTitle>Buses</SectionTitle>
          {buses.length === 0 ? (
            <Text style={styles.empty}>Add your first bus to get started.</Text>
          ) : (
            <Card style={styles.list}>
              {buses.map((bus, i) => (
                <BusRow
                  key={bus.id}
                  bus={bus}
                  first={i === 0}
                  drivers={drivers}
                  arrangements={arrangements.filter((a) => a.vehicleId === bus.id)}
                  day={currentDayForVehicle(overview.days, bus.id, localDate())}
                  lastDay={lastFinishedDayForVehicle(overview.days, bus.id)}
                  entries={overview.entries}
                  costs={overview.costs}
                />
              ))}
            </Card>
          )}
          <View style={styles.action}>
            <Button
              variant={buses.length === 0 ? 'primary' : 'secondary'}
              label="Add a bus"
              onPress={() => router.push('/add-bus')}
            />
          </View>

          <SectionTitle>Drivers</SectionTitle>
          {drivers.length === 0 ? (
            <Text style={styles.empty}>No drivers have joined yet. Invite a driver, and they appear here once they join.</Text>
          ) : (
            <Card style={styles.list}>
              {drivers.map((driver, i) => (
                <View key={driver.id} style={[styles.row, i > 0 && styles.divider]}>
                  <Text style={styles.rowTitle}>{driver.name ?? 'New driver'}</Text>
                  {driver.phone ? <Text style={styles.detail}>+{driver.phone}</Text> : null}
                </View>
              ))}
            </Card>
          )}
          <View style={styles.action}>
            <Button
              variant={buses.length > 0 && drivers.length === 0 ? 'primary' : 'secondary'}
              label="Invite a driver"
              onPress={() => router.push('/invite')}
            />
          </View>
        </>
      ) : null}

      <Footer />
    </ScrollView>
  );
}

function BusRow(props: {
  bus: Bus;
  first: boolean;
  drivers: Driver[];
  arrangements: ArrangementRecord[];
  day: DayView | null;
  lastDay: DayView | null;
  entries: DayEntry[];
  costs: DayCost[];
}) {
  const { bus, drivers, arrangements, day } = props;
  const assigned = arrangements.some((a) => a.status !== 'declined');
  return (
    <View style={[styles.row, !props.first && styles.divider]}>
      <View style={styles.busHeading}>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>{bus.plate}</Text>
          <Text style={styles.detail}>{busTypeLabel(bus.type)}</Text>
        </View>
        {drivers.length > 0 ? (
          <Button
            compact
            variant={assigned ? 'secondary' : 'primary'}
            label={assigned ? 'Change' : 'Assign driver'}
            onPress={() => router.push({ pathname: '/assign', params: { bus: bus.id } })}
          />
        ) : null}
      </View>
      {day ? (
        <>
          <DayStatus day={day} />
          <DayTotals day={day} entries={props.entries} costs={props.costs} />
          <DayActivity
            viewer="owner"
            entries={props.entries.filter((e) => e.tripDayId === day.id)}
            costs={props.costs.filter((c) => c.tripDayId === day.id)}
          />
        </>
      ) : null}
      <SettlementLink day={day} last={props.lastDay} plate={bus.plate} />
      {arrangements.map((a) => {
        const driver = drivers.find((d) => d.id === a.driverId);
        return (
          <View key={a.id} style={styles.arrangement}>
            <View style={styles.arrangementHeading}>
              <Text style={styles.driverName}>{driver?.name ?? 'Driver'}</Text>
              <StatusPill status={a.status} />
            </View>
            <Text style={styles.detail}>{describeTerms(a.type, a.terms, 'owner')}</Text>
            <Text style={styles.detail}>{describeCosts(a.fuelBearer, a.otherCostsBearer, 'owner')}</Text>
            {a.declineReason ? <Text style={styles.detail}>Reason: {a.declineReason}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function StatusPill({ status }: { status: ArrangementRecord['status'] }) {
  if (status === 'active') return <Pill label="Agreed" tone="ok" />;
  if (status === 'proposed') return <Pill label="Waiting for driver" tone="waiting" />;
  return <Pill label="Declined" tone="problem" />;
}

function DayStatus({ day }: { day: DayView }) {
  const running = day.odometerEnd === null;
  return (
    <View style={styles.day}>
      <View style={styles.arrangementHeading}>
        <Text style={styles.driverName}>{running ? `Started at ${km(day.odometerStart)}` : `Drove ${km(day.odometerEnd! - day.odometerStart)}`}</Text>
        <Pill label={running ? 'Day running' : 'Day finished'} tone={running ? 'ok' : 'neutral'} />
      </View>
      {day.serviceDate !== localDate() ? <Text style={styles.detail}>Started on {formatDay(day.serviceDate)}</Text> : null}
      {day.unsent ? <Text style={styles.detail}>Saved on this phone, not sent yet.</Text> : null}
    </View>
  );
}

/** The owner's running count for a day. Unchecked amounts are called out, because the settlement only counts confirmed ones. */
function DayTotals({ day, entries, costs }: { day: DayView; entries: DayEntry[]; costs: DayCost[] }) {
  const summary = summariseDay(entries, costs, day.id);
  const withWaiting = (amount: number, waiting: number) => (waiting > 0 ? `${kwacha(amount)} (${kwacha(waiting)} to check)` : kwacha(amount));
  return (
    <View style={styles.totals}>
      <MoneyRow label="Takings" value={withWaiting(summary.takings, summary.takingsWaiting)} />
      <MoneyRow label="Costs from the cash" value={kwacha(summary.costsFromCash)} />
      <MoneyRow label="Handed to you" value={withWaiting(summary.handedOver, summary.handedOverWaiting)} last />
    </View>
  );
}

function RunningDay(props: { day: DayView; vehicleId: string; plate: string; entries: DayEntry[]; costs: DayCost[] }) {
  const { day, vehicleId, plate } = props;
  const summary = summariseDay(props.entries, props.costs, day.id);
  const record = (kind: 'takings' | 'remittance') =>
    router.push({ pathname: '/record-cash', params: { day: day.id, kind } });

  return (
    <>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Cash you should have</Text>
        <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
          {kwacha(summary.cashInHand)}
        </Text>
        <Text style={styles.heroNote}>
          {kwacha(summary.takings)} collected − {kwacha(summary.costsFromCash)} spent − {kwacha(summary.handedOver)} to owner
        </Text>
      </View>
      <View style={styles.action}>
        <Button label="Record takings" onPress={() => record('takings')} />
      </View>
      <View style={styles.action}>
        <Button variant="secondary" label="Give cash to the owner" onPress={() => record('remittance')} />
      </View>
      <View style={styles.action}>
        <Button
          variant="secondary"
          label="Add a cost"
          onPress={() => router.push({ pathname: '/add-cost', params: { day: day.id, bus: vehicleId } })}
        />
      </View>
      <DayActivity
        viewer="driver"
        entries={props.entries.filter((e) => e.tripDayId === day.id)}
        costs={props.costs.filter((c) => c.tripDayId === day.id)}
      />
      <View style={styles.action}>
        <Button
          variant="secondary"
          label="End day"
          onPress={() =>
            router.push({ pathname: '/end-day', params: { day: day.id, plate, start: String(day.odometerStart) } })
          }
        />
      </View>
    </>
  );
}

function DriverHome({ business, userId }: { business: Business; userId: string }) {
  const insets = useSafeAreaInsets();
  const { data: overview, failed, refreshing, reload } = useDriverOverview(business.id, userId);
  const { waiting, refused, dismissRefused } = useCommandQueue(userId, reload);
  const arrangements = overview?.arrangements ?? [];
  const offers = arrangements.filter((a) => a.status === 'proposed');
  const agreed = arrangements.filter((a) => a.status === 'active');
  const plateOf = (a: ArrangementRecord) => overview?.buses.find((b) => b.id === a.vehicleId)?.plate ?? 'Your bus';
  const days = applyQueuedDayCommands(overview?.days ?? [], waiting);
  const { entries, costs } = applyQueuedEntries(overview?.entries ?? [], overview?.costs ?? [], waiting);
  // One person drives one bus at a time.
  const running = days.some((d) => d.odometerEnd === null);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(6) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Header business={business} roleLabel="Driver" />
      {failed ? <LoadProblem onRetry={reload} /> : null}
      {overview?.saved ? (
        <Note>No signal. This is what was last loaded, and you can still record your day.</Note>
      ) : null}
      {refused.map((c) => (
        <Card key={c.clientId} style={styles.problem}>
          <Text style={styles.refusedTitle}>{REFUSED_TITLE[c.type] ?? 'Your entry was not accepted'}</Text>
          <Text style={styles.message}>{reasonForCode(c.refusedCode!)}</Text>
          <Button compact variant="secondary" label="OK" onPress={() => dismissRefused(c.clientId)} />
        </Card>
      ))}

      {overview && overview.paymentsToCheck.length > 0 ? (
        <>
          <SectionTitle>Needs you</SectionTitle>
          <Card style={styles.list}>
            {overview.paymentsToCheck.map((payment, i) => (
              <View key={payment.id} style={[styles.row, styles.needs, i > 0 && styles.divider]}>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>The owner says they paid you {kwacha(payment.amount)}</Text>
                  <Text style={styles.detail}>For {formatDay(payment.serviceDate)}</Text>
                </View>
                <Button
                  compact
                  label="Check"
                  onPress={() =>
                    router.push({
                      pathname: '/day-settlement',
                      params: {
                        day: payment.tripDayId,
                        plate: overview.buses.find((b) => b.id === payment.vehicleId)?.plate ?? '',
                      },
                    })
                  }
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {offers.length > 0 ? (
        <>
          <SectionTitle>New offers</SectionTitle>
          <Card style={styles.list}>
            {offers.map((a, i) => (
              <View key={a.id} style={[styles.row, i > 0 && styles.divider]}>
                <Text style={styles.rowTitle}>{plateOf(a)}</Text>
                <Text style={styles.detail}>{describeTerms(a.type, a.terms, 'driver')}</Text>
                <View style={styles.action}>
                  <Button label="Review offer" onPress={() => router.push({ pathname: '/offer', params: { id: a.id } })} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {agreed.length > 0 ? (
        <>
          <SectionTitle>Your bus</SectionTitle>
          <Card style={styles.list}>
            {agreed.map((a, i) => {
              const plate = plateOf(a);
              const day = currentDayForVehicle(days, a.vehicleId, localDate());
              return (
                <View key={a.id} style={[styles.row, i > 0 && styles.divider]}>
                  <Text style={styles.rowTitle}>{plate}</Text>
                  <Text style={styles.detail}>{describeTerms(a.type, a.terms, 'driver')}</Text>
                  <Text style={styles.detail}>{describeCosts(a.fuelBearer, a.otherCostsBearer, 'driver')}</Text>
                  {day ? <DayStatus day={day} /> : null}
                  {day?.odometerEnd === null ? (
                    <RunningDay day={day} vehicleId={a.vehicleId} plate={plate} entries={entries} costs={costs} />
                  ) : null}
                  {day && day.odometerEnd !== null ? (
                    <DayActivity
                      viewer="driver"
                      entries={entries.filter((e) => e.tripDayId === day.id)}
                      costs={costs.filter((c) => c.tripDayId === day.id)}
                    />
                  ) : null}
                  <SettlementLink day={day} last={lastFinishedDayForVehicle(days, a.vehicleId)} plate={plate} />
                  {!day && !running ? (
                    <View style={styles.action}>
                      <Button
                        label="Start day"
                        onPress={() => router.push({ pathname: '/start-day', params: { bus: a.vehicleId, plate } })}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {overview && offers.length === 0 && agreed.length === 0 ? (
        <Note>
          You have joined {business.name}. Your owner still needs to give you a bus and agree how the money is split. Pull down
          to check for an offer.
        </Note>
      ) : null}

      <Footer />
    </ScrollView>
  );
}

function LoadProblem({ onRetry }: { onRetry: () => void }) {
  return (
    <Card style={styles.problem}>
      <Text style={styles.message}>Could not load your business. Check your signal and try again.</Text>
      <Button compact variant="secondary" label="Try again" onPress={onRetry} />
    </Card>
  );
}

function Header({ business, roleLabel }: { business: Business; roleLabel: string }) {
  const { account } = useAuth();
  const initials = business.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

  return (
    <View style={styles.header}>
      <Avatar initials={initials} dark />
      <View style={styles.flex}>
        <Text style={styles.name}>{business.name}</Text>
        <Text style={styles.detail}>
          {roleLabel} · {account?.displayName}
        </Text>
      </View>
    </View>
  );
}

function Footer() {
  const { signOut } = useAuth();

  return (
    <View style={styles.links}>
      <Pressable onPress={() => router.push('/history')} accessibilityRole="link" hitSlop={8}>
        <Text style={styles.link}>Past days</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/demo')} accessibilityRole="link" hitSlop={8}>
        <Text style={styles.link}>See a demo</Text>
      </Pressable>
      <Pressable onPress={signOut} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.link}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space(4) },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  detail: { fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 2 },
  problem: { gap: space(3), marginTop: space(4), alignItems: 'flex-start' },
  message: { fontSize: 15, lineHeight: 22, color: colors.text },
  empty: { fontSize: 15, lineHeight: 22, color: colors.muted },
  list: { paddingVertical: 0 },
  row: { paddingVertical: space(3.5) },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  busHeading: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  needs: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  day: { marginTop: space(3), paddingTop: space(3), borderTopWidth: 1, borderTopColor: colors.border },
  totals: { marginTop: space(2) },
  hero: { backgroundColor: colors.dark, borderRadius: radius.card, padding: space(5), marginTop: space(3) },
  heroLabel: { fontSize: 15, fontWeight: '600', color: colors.onDarkMuted },
  heroAmount: { fontSize: 40, fontWeight: '800', color: colors.onDark, marginVertical: space(1), fontVariant: ['tabular-nums'] },
  heroNote: { fontSize: 13, lineHeight: 18, color: colors.onDarkMuted },
  refusedTitle: { fontSize: 16, fontWeight: '700', color: colors.owes },
  arrangement: { marginTop: space(3), paddingTop: space(3), borderTopWidth: 1, borderTopColor: colors.border },
  arrangementHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  driverName: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  action: { marginTop: space(3) },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto', paddingTop: space(8) },
  link: { fontSize: 14, fontWeight: '600', color: colors.text, textDecorationLine: 'underline' },
});
