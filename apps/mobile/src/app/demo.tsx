import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { Avatar } from '@/components/ui';
import { useSample } from '@/lib/sample';
import { colors, radius, space } from '@/lib/theme';

export default function Demo() {
  const insets = useSafeAreaInsets();
  const { reset } = useSample();

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + space(4) }]}>
      <Stack.Screen options={{ title: 'Demo' }} />
      <Text style={styles.intro}>
        These screens use a made-up business, not your account. Record cash as the driver, then switch role and confirm it
        as the owner.
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
  screen: { flex: 1, padding: space(4) },
  intro: { fontSize: 15, lineHeight: 22, color: colors.muted, marginBottom: space(4) },
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
  pressed: { opacity: 0.6 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  cardDetail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto' },
  link: { fontSize: 14, fontWeight: '600', color: colors.text, textDecorationLine: 'underline' },
});
