import { locationStatus, type LocationStatus } from '@dt/domain';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BusMap, type MapBus } from '@/components/bus-map';
import { Icon } from '@/components/icons';
import { callPhone } from '@/components/home-parts';
import { Button, Card, ListRow, LoadError, Pill, ScreenLoading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchLiveMap, useScreenData } from '@/lib/business';
import { colors, radius, space, themedStyles } from '@/lib/theme';

const REFRESH_MS = 30_000;

function ago(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min ago`;
}

function statusPill(status: LocationStatus | null, dayRunning: boolean) {
  if (status === null) return dayRunning ? <Pill label="No location yet" tone="waiting" /> : <Pill label="No day today" tone="neutral" />;
  switch (status.state) {
    case 'moving':
      return <Pill label="Moving" tone="ok" />;
    case 'parked':
      return <Pill label="Stopped" tone="ok" />;
    case 'late':
      return <Pill label="Location lost" tone="problem" />;
    case 'day_over':
      return <Pill label="Day ended" tone="neutral" />;
  }
}

export default function LiveMap() {
  const params = useLocalSearchParams<{ bus?: string }>();
  const { account } = useAuth();
  const businessId = account?.business?.id ?? '';
  const load = useCallback(() => fetchLiveMap(businessId), [businessId]);
  const { data, failed, reload } = useScreenData(load);
  const [chosen, setChosen] = useState<string | null>(params.bus ?? null);

  // Phones send about once a minute, so this keeps the map as fresh as the data is.
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => void reload(), REFRESH_MS);
      return () => clearInterval(timer);
    }, [reload]),
  );

  const rows = useMemo(() => {
    const now = new Date().toISOString();
    return (data?.buses ?? []).map((bus) => {
      const position = data?.positions.find((p) => p.vehicleId === bus.id) ?? null;
      const dayRunning = data?.runningVehicleIds.includes(bus.id) ?? false;
      return {
        bus,
        position,
        dayRunning,
        status: position ? locationStatus(position, dayRunning, now) : null,
        driver: data?.drivers.find((d) => d.id === position?.driverId) ?? null,
      };
    });
  }, [data]);

  const markers = useMemo<MapBus[]>(
    () =>
      rows.flatMap(({ bus, position, status }) =>
        position
          ? [{ id: bus.id, plate: bus.plate, latitude: position.latitude, longitude: position.longitude, live: status?.state === 'moving' || status?.state === 'parked' }]
          : [],
      ),
    [rows],
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Live map' }} />
      <View style={styles.map}>
        <BusMap buses={markers} chosen={chosen} onChoose={setChosen} />
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {failed && !data ? <LoadError message="Could not load your buses. Check your signal and try again." onRetry={reload} /> : null}
        {!data && !failed ? <ScreenLoading /> : null}
        {data ? (
          <Card style={styles.card}>
            {rows.map(({ bus, position, status, dayRunning, driver }, i) => {
              const speed = status?.state === 'moving' && position?.speedKmh != null ? `${Math.round(position.speedKmh)} km/h · ` : '';
              const seen = status ? `${speed}Last seen ${ago(status.minutesAgo)}` : dayRunning ? 'The driver’s phone has not sent a location' : 'Not on the road';
              return (
                <ListRow
                  key={bus.id}
                  first={i === 0}
                  leading={
                    <View style={[styles.busIcon, bus.id === chosen && styles.busIconChosen]}>
                      <Icon name="bus" size={20} color={bus.id === chosen ? colors.primaryText : colors.owed} />
                    </View>
                  }
                  title={bus.plate}
                  detail={driver?.name ? `${driver.name} · ${seen}` : seen}
                  right={
                    status?.state === 'late' && driver?.phone ? (
                      <Button compact variant="secondary" label="Call" onPress={() => callPhone(driver.phone as string)} />
                    ) : (
                      statusPill(status, dayRunning)
                    )
                  }
                  onPress={position ? () => setChosen(bus.id) : undefined}
                />
              );
            })}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  map: { flex: 3 },
  list: { padding: space(4), paddingBottom: space(8) },
  card: { padding: 0, overflow: 'hidden' },
  busIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.owedSoft,
  },
  busIconChosen: { backgroundColor: colors.primary },
}));
