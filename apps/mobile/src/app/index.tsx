import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { Avatar, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useSample } from '@/lib/sample';
import { colors, radius, space } from '@/lib/theme';

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', driver: 'Driver' };

export default function Home() {
  const insets = useSafeAreaInsets();
  const { reset } = useSample();
  const { account, signOut } = useAuth();
  const business = account?.business;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space(6), paddingBottom: insets.bottom + space(4) }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={styles.title}>Welcome, {account?.displayName}</Text>

      <Card style={styles.account}>
        <Text style={styles.accountName}>{business?.name}</Text>
        <Text style={styles.cardDetail}>
          {business ? (ROLE_LABELS[business.role] ?? business.role) : ''} · +{account?.phone}
        </Text>
      </Card>

      <Text style={styles.section} accessibilityRole="header">
        Try the screens
      </Text>
      <Text style={styles.intro}>
        You are signed in with your real account, but these screens still use a sample business. Record cash as the
        driver, then switch role and confirm it as the owner.
      </Text>

      <RoleCard initials="MB" dark title="Sample owner" detail="Mr Banda, 4 buses" onPress={() => router.push('/owner')} />
      <RoleCard initials="JM" title="Sample driver" detail="Joseph, BAF 2314" onPress={() => router.push('/driver')} />

      <View style={styles.links}>
        <Pressable onPress={() => router.push('/calculator')} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.link}>Calculator</Text>
        </Pressable>
        <Pressable onPress={reset} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>Reset sample</Text>
        </Pressable>
        <Pressable onPress={signOut} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RoleCard(props: { initials: string; dark?: boolean; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Avatar initials={props.initials} dark={props.dark} />
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{props.title}</Text>
        <Text style={styles.cardDetail}>{props.detail}</Text>
      </View>
      <Icon name="chevronRight" size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space(4) },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: space(3) },
  account: { marginBottom: space(6) },
  accountName: { fontSize: 18, fontWeight: '700', color: colors.text },
  section: { fontSize: 18, fontWeight: '700', color: colors.text },
  intro: { fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: space(1), marginBottom: space(4) },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space(4),
    marginBottom: space(3),
  },
  pressed: { opacity: 0.75 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  cardDetail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto' },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary, textDecorationLine: 'underline' },
});
