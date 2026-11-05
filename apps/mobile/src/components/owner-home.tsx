import { currentDayForVehicle, summariseDay } from '@dt/domain';
import { router, Stack } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayStatusPill, HomeHeader, initialsOf, QuickLinks, type Business } from '@/components/home-parts';
import { Icon } from '@/components/icons';
import { Text } from '@/components/text';
import { Avatar, Button, Card, EmptyState, ListRow, LoadError, Pill, ScreenLoading, Section } from '@/components/ui';
import { formatDay, kwacha, localDate, type ArrangementRecord } from '@/lib/arrangements';
import { costCategoryLabel, reportKindLabel, useOwnerOverview } from '@/lib/business';
import { colors, radius, space, themedStyles, type } from '@/lib/theme';

function arrangementPill(arrangements: ArrangementRecord[]) {
  if (arrangements.some((a) => a.status === 'proposed')) return <Pill label="Waiting for driver" tone="waiting" />;
  // The home screen is about today: this is only reached when the bus has no day yet.
  if (arrangements.some((a) => a.status === 'active')) return <Pill label="Not started" tone="neutral" />;
  if (arrangements.some((a) => a.status === 'declined')) return <Pill label="Declined" tone="problem" />;
  return <Pill label="No driver" tone="neutral" />;
}

export function OwnerHome({ business }: { business: Business }) {
  const insets = useSafeAreaInsets();
  const { data: overview, failed, refreshing, reload } = useOwnerOverview(business.id);
  const buses = overview?.buses ?? [];
  const drivers = overview?.drivers ?? [];
  const arrangements = overview?.arrangements ?? [];
  const today = localDate();

  const days = buses.flatMap((bus) => {
    const day = overview ? currentDayForVehicle(overview.days, bus.id, today) : null;
    return day ? [day] : [];
  });
  const summaries = days.map((day) => summariseDay(overview?.entries ?? [], overview?.costs ?? [], day.id));
  const total = (pick: (s: (typeof summaries)[number]) => number) => summaries.reduce((sum, s) => sum + pick(s), 0);
  const needsYou =
    (overview?.toCheck.length ?? 0) +
    (overview?.costsToCheck.length ?? 0) +
    (overview?.paymentsToCheck.length ?? 0) +
    (overview?.reportsToCheck.length ?? 0);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space(6) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <HomeHeader business={business} roleLabel="Owner" />
      {failed ? <LoadError message="Could not load your business. Check your signal and try again." onRetry={reload} /> : null}
      {!overview && !failed ? <ScreenLoading /> : null}

      {overview ? (
        <>
          {buses.length > 0 ? (
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <Text style={styles.heroLabel}>Takings today</Text>
                <Text style={styles.heroLabel}>{formatDay(today)}</Text>
              </View>
              <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
                {kwacha(total((s) => s.takings))}
              </Text>
              <View style={styles.heroStats}>
                <HeroStat label="Handed to you" value={kwacha(total((s) => s.handedOver))} />
                <HeroStat label="Costs" value={kwacha(total((s) => s.costsFromCash))} />
                <HeroStat label="Buses running" value={`${days.filter((d) => d.odometerEnd === null).length} of ${buses.length}`} />
              </View>
            </View>
          ) : null}

          {buses.length > 0 ? <QuickLinks /> : null}

          {needsYou > 0 ? (
            <Section title="Needs you" waiting={needsYou}>
              <Card style={styles.list}>
                {overview.reportsToCheck.map((report, i) => (
                  <ListRow
                    key={report.id}
                    first={i === 0}
                    title={`${drivers.find((d) => d.id === report.driverId)?.name ?? 'Your driver'} reported: ${reportKindLabel(report.kind)}`}
                    detail={[formatDay(report.serviceDate), buses.find((b) => b.id === report.vehicleId)?.plate].filter(Boolean).join(' · ')}
                    right={
                      <Button
                        compact
                        label="Check"
                        onPress={() => router.push({ pathname: '/check-report', params: { report: report.id } })}
                      />
                    }
                  />
                ))}
                {overview.paymentsToCheck.map((payment, i) => (
                  <ListRow
                    key={payment.id}
                    first={i === 0 && overview.reportsToCheck.length === 0}
                    title={`${drivers.find((d) => d.id === payment.driverId)?.name ?? 'Your driver'} says they paid you ${kwacha(payment.amount)}`}
                    detail={`For ${formatDay(payment.serviceDate)}`}
                    right={
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
                    }
                  />
                ))}
                {overview.toCheck.map(({ entry, vehicleId, driverId }, i) => {
                  const driver = drivers.find((d) => d.id === driverId)?.name ?? 'Your driver';
                  return (
                    <ListRow
                      key={entry.id}
                      first={i === 0 && overview.paymentsToCheck.length === 0 && overview.reportsToCheck.length === 0}
                      title={
                        entry.kind === 'remittance'
                          ? `${driver} handed you ${kwacha(entry.amount)}`
                          : `${driver} collected ${kwacha(entry.amount)}`
                      }
                      detail={buses.find((b) => b.id === vehicleId)?.plate}
                      right={
                        <Button
                          compact
                          label="Check"
                          onPress={() => router.push({ pathname: '/check-cash', params: { entry: entry.id } })}
                        />
                      }
                    />
                  );
                })}
                {overview.costsToCheck.map(({ cost, vehicleId, driverId }, i) => (
                  <ListRow
                    key={cost.id}
                    first={i === 0 && overview.paymentsToCheck.length === 0 && overview.toCheck.length === 0 && overview.reportsToCheck.length === 0}
                    title={`${drivers.find((d) => d.id === driverId)?.name ?? 'Your driver'} spent ${kwacha(cost.amount)}`}
                    detail={[costCategoryLabel(cost.category), buses.find((b) => b.id === vehicleId)?.plate].filter(Boolean).join(' · ')}
                    right={
                      <Button
                        compact
                        label="Check"
                        onPress={() => router.push({ pathname: '/check-cost', params: { cost: cost.id } })}
                      />
                    }
                  />
                ))}
              </Card>
            </Section>
          ) : null}

          <Section title="Buses" action={buses.length > 0 ? { label: 'Add', onPress: () => router.push('/add-bus') } : undefined}>
            {buses.length === 0 ? (
              <EmptyState
                title="Add your first bus"
                detail="Then invite a driver and agree how the money is split."
                action={{ label: 'Add a bus', onPress: () => router.push('/add-bus') }}
              />
            ) : (
              <Card style={styles.list}>
                {buses.map((bus, i) => {
                  const onBus = arrangements.filter((a) => a.vehicleId === bus.id);
                  const day = currentDayForVehicle(overview.days, bus.id, today);
                  const names = onBus
                    .filter((a) => a.status !== 'declined')
                    .map((a) => drivers.find((d) => d.id === a.driverId)?.name)
                    .filter(Boolean);
                  const who = names.length > 0 ? [...new Set(names)].join(', ') : 'Tap to assign a driver';
                  const takings = day ? summariseDay(overview.entries, overview.costs, day.id).takings : null;
                  return (
                    <ListRow
                      key={bus.id}
                      first={i === 0}
                      leading={
                        <View style={styles.busIcon}>
                          <Icon name="bus" size={22} color={colors.owed} />
                        </View>
                      }
                      title={bus.plate}
                      detail={takings === null ? who : `${who} · ${kwacha(takings)} today`}
                      right={day ? <DayStatusPill day={day} /> : arrangementPill(onBus)}
                      onPress={() => router.push({ pathname: '/bus', params: { bus: bus.id } })}
                    />
                  );
                })}
              </Card>
            )}
          </Section>

          <Section title="Drivers" action={drivers.length > 0 ? { label: 'Invite', onPress: () => router.push('/invite') } : undefined}>
            {drivers.length === 0 ? (
              <EmptyState
                title="No drivers yet"
                detail="Invite a driver with a code. They appear here once they join."
                action={{ label: 'Invite a driver', onPress: () => router.push('/invite') }}
              />
            ) : (
              <Card style={styles.list}>
                {drivers.map((driver, i) => {
                  const agreed = arrangements.find((a) => a.driverId === driver.id && a.status === 'active');
                  const plate = buses.find((b) => b.id === agreed?.vehicleId)?.plate;
                  return (
                    <ListRow
                      key={driver.id}
                      first={i === 0}
                      leading={<Avatar initials={initialsOf(driver.name ?? 'New driver')} />}
                      title={driver.name ?? 'New driver'}
                      detail={[plate, driver.phone ? `+${driver.phone}` : null].filter(Boolean).join(' · ') || undefined}
                      onPress={() => router.push({ pathname: '/driver', params: { driver: driver.id } })}
                    />
                  );
                })}
              </Card>
            )}
          </Section>
        </>
      ) : null}

      {/* Under the hero once there is a bus. Before that, the first steps come first. */}
      {buses.length === 0 ? <QuickLinks /> : null}
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
  content: { flexGrow: 1, paddingHorizontal: space(4) },
  list: { padding: 0, overflow: 'hidden' },
  hero: { backgroundColor: colors.hero, borderRadius: radius.card, padding: space(5), marginTop: space(5) },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space(3) },
  heroLabel: { ...type.small, color: colors.onDarkMuted },
  busIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.owedSoft,
  },
  heroAmount: { ...type.display, color: colors.primary, marginTop: space(1), fontVariant: ['tabular-nums'] },
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
}));
