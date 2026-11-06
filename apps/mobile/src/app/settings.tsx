import { router, Stack } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { OptionCard } from '@/components/form';
import { initialsOf } from '@/components/home-parts';
import { Text } from '@/components/text';
import { Avatar, Card, ListRow, Pill, Section } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { setVoiceOn, useVoiceOn } from '@/lib/navigation';
import { colors, setThemeMode, space, themedStyles, type, useThemeMode } from '@/lib/theme';
import { trackingDayId, useLocationOn } from '@/lib/tracking';

function TrackingOnRow({ tripDayId, userId }: { tripDayId: string; userId: string }) {
  const { on } = useLocationOn(tripDayId, userId);
  return on ? (
    <ListRow first icon="map" title="On" detail="Your owner can see the bus until you end your day." right={<Pill label="Sharing" tone="ok" />} />
  ) : (
    <ListRow
      first
      icon="map"
      title="Stopped"
      detail="Your owner cannot see the bus. Go to your home screen to turn location back on."
      right={<Pill label="Off" tone="problem" />}
      onPress={() => router.dismissAll()}
    />
  );
}

/** Tracking follows the working day, so there is no switch here: this only shows where it stands. */
function VehicleTracking() {
  const { userId, account } = useAuth();
  const tripDayId = trackingDayId();
  return (
    <Section title="Vehicle tracking">
      <Card style={styles.list}>
        {account?.business?.role === 'owner' ? (
          <ListRow first icon="map" title="Live map" detail="See where your buses are." onPress={() => router.push('/map')} />
        ) : tripDayId && userId ? (
          <TrackingOnRow tripDayId={tripDayId} userId={userId} />
        ) : (
          <ListRow first icon="map" title="Off" detail="Location turns on when you start your day, and off when you end it." />
        )}
      </Card>
    </Section>
  );
}

function TripDirections() {
  const voiceOn = useVoiceOn();
  return (
    <Section title="Trip directions">
      <Card style={styles.list}>
        <ListRow
          first
          icon={voiceOn ? 'volume' : 'volumeOff'}
          title="Spoken directions"
          detail="The app tells you each turn out loud during a trip."
          right={
            <Switch
              value={voiceOn}
              onValueChange={setVoiceOn}
              accessibilityLabel="Spoken directions"
              trackColor={{ true: colors.primary, false: colors.borderStrong }}
              thumbColor={colors.surface}
            />
          }
        />
      </Card>
    </Section>
  );
}

export default function Settings() {
  const { account, signOut, signOutEverywhere } = useAuth();
  const business = account?.business;
  const { mode } = useThemeMode();

  const confirmSignOutEverywhere = () => {
    Alert.alert(
      'Sign out of all your phones?',
      'Use this if a phone is lost or stolen. You will need to sign in again on this phone too.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out everywhere',
          style: 'destructive',
          onPress: () => {
            void signOutEverywhere().then((failed) => {
              if (failed) {
                Alert.alert(
                  'Other phones may still be signed in',
                  'This phone is signed out, but we could not reach the server. Sign in again with signal and try once more.',
                );
              }
            });
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Settings' }} />
      <Card style={styles.profile}>
        <Avatar initials={initialsOf(account?.displayName ?? '')} green />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {account?.displayName}
          </Text>
          {account?.phone ? <Text style={styles.detail}>+{account.phone}</Text> : null}
          {business ? (
            <Text style={styles.detail} numberOfLines={1}>
              {business.role === 'owner' ? 'Owner' : 'Driver'} · {business.name}
            </Text>
          ) : null}
        </View>
      </Card>

      <VehicleTracking />
      {business?.role === 'owner' ? null : <TripDirections />}

      <Section title="Appearance">
        <View accessibilityRole="radiogroup">
          <OptionCard title="Use phone setting" detail="Follows your phone, next time you open the app." selected={mode === 'system'} onPress={() => setThemeMode('system')} />
          <OptionCard title="Light" detail="Easier to read in bright sun." selected={mode === 'light'} onPress={() => setThemeMode('light')} />
          <OptionCard title="Dark" detail="Easier on the eyes at night." selected={mode === 'dark'} onPress={() => setThemeMode('dark')} />
        </View>
      </Section>

      <Section title="Security">
        <Card style={styles.list}>
          <ListRow first icon="lock" title="Change password" onPress={() => router.push('/change-password')} />
        </Card>
      </Section>

      <Section title="Sign out">
        <Card style={styles.list}>
          <ListRow first icon="logOut" title="Sign out" onPress={signOut} />
          <ListRow
            danger
            icon="logOut"
            title="Sign out of all my phones"
            detail="If a phone is lost or stolen"
            onPress={confirmSignOutEverywhere}
          />
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
}));
