import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { callPhone, initialsOf, km } from '@/components/home-parts';
import { Text } from '@/components/text';
import { Avatar, Button, Card, EmptyState, ListRow, LoadError, MoneyRow, ScreenLoading, Section } from '@/components/ui';
import { describeTerms, formatDay, kwacha } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { fetchDriverRecord, useOwnerOverview, useScreenData } from '@/lib/business';
import { colors, space, themedStyles, type } from '@/lib/theme';

function balanceLine(balance: number): { value: string; color: string } {
  if (balance > 0) return { value: `Owes you ${kwacha(balance)}`, color: colors.owes };
  if (balance < 0) return { value: `You owe ${kwacha(-balance)}`, color: colors.owes };
  return { value: 'Nothing owed', color: colors.owed };
}

export default function DriverDetail() {
  const { driver: driverId } = useLocalSearchParams<{ driver: string }>();
  const { account } = useAuth();
  const businessId = account?.business?.id ?? '';
  const { data: overview, failed, refreshing, reload } = useOwnerOverview(businessId);
  const loadRecord = useCallback(() => fetchDriverRecord(businessId, driverId), [businessId, driverId]);
  const { data: record, reload: reloadRecord } = useScreenData(loadRecord);

  const driver = overview?.drivers.find((d) => d.id === driverId);
  const name = driver?.name ?? 'New driver';
  const title = <Stack.Screen options={{ title: 'Driver' }} />;
  if (!overview || !driver) {
    return (
      <View style={styles.flex}>
        {title}
        {failed ? (
          <View style={styles.content}>
            <LoadError message="Could not load this driver. Check your signal and try again." onRetry={reload} />
          </View>
        ) : (
          <ScreenLoading />
        )}
      </View>
    );
  }

  const agreements = overview.arrangements.filter((a) => a.driverId === driver.id && a.status === 'active');
  const balance = record ? balanceLine(record.balance) : null;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void reload();
            void reloadRecord();
          }}
        />
      }
    >
      {title}
      <Card style={styles.profile}>
        <Avatar initials={initialsOf(name)} green />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {driver.phone ? <Text style={styles.detail}>+{driver.phone}</Text> : null}
        </View>
        {driver.phone ? <Button compact variant="secondary" label="Call" onPress={() => callPhone(driver.phone as string)} /> : null}
      </Card>

      <Section title="Bus">
        {agreements.length === 0 ? (
          <EmptyState title="No bus agreed" detail="Open a bus from the home screen to offer it to this driver." />
        ) : (
          <Card style={styles.list}>
            {agreements.map((a, i) => (
              <ListRow
                key={a.id}
                first={i === 0}
                title={overview.buses.find((b) => b.id === a.vehicleId)?.plate ?? 'Bus'}
                detail={describeTerms(a.type, a.terms, 'owner')}
                onPress={() => router.push({ pathname: '/bus', params: { bus: a.vehicleId } })}
              />
            ))}
          </Card>
        )}
      </Section>

      <Section title="Record">
        <Card style={styles.rows}>
          <MoneyRow label="Joined" value={formatDay(driver.joinedAt.slice(0, 10))} />
          {record && balance ? (
            <>
              <MoneyRow label="Days finished" value={String(record.daysWorked)} />
              <MoneyRow label="Last worked" value={record.lastWorked ? formatDay(record.lastWorked) : 'Not yet'} />
              <MoneyRow label="Distance driven" value={km(record.distance)} />
              <MoneyRow label="Balance" value={balance.value} color={balance.color} strong last />
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
  profile: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  name: { ...type.heading, color: colors.text },
  detail: { ...type.small, color: colors.muted, marginTop: 2 },
  list: { padding: 0, overflow: 'hidden' },
  rows: { paddingVertical: space(1) },
}));
