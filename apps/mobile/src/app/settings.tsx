import { router, Stack } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { OptionCard } from '@/components/form';
import { initialsOf } from '@/components/home-parts';
import { Text } from '@/components/text';
import { Avatar, Card, ListRow, Section } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, setThemeMode, space, themedStyles, type, useThemeMode } from '@/lib/theme';

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
