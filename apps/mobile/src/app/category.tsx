import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { Logo, RoadBackdrop } from '@/components/logo';
import { Text } from '@/components/text';
import { chooseBus } from '@/lib/category';
import { colors, radius, space, TAP_TARGET, themedStyles, type } from '@/lib/theme';

function CategoryTile(props: { icon: IconName; title: string; detail: string; comingSoon?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.comingSoon ? `${props.title}, coming soon` : props.title}
      style={({ pressed }) => [styles.tile, !props.comingSoon && styles.tileOpen, pressed && styles.tilePressed]}
    >
      <View style={[styles.tileIcon, !props.comingSoon && styles.tileIconOpen]}>
        <Icon name={props.icon} color={props.comingSoon ? colors.onDarkMuted : colors.primaryText} />
      </View>
      <View style={styles.tileText}>
        <Text style={[styles.tileTitle, props.comingSoon && styles.tileTitleSoon]}>{props.title}</Text>
        <Text style={styles.tileDetail}>{props.detail}</Text>
      </View>
      {props.comingSoon ? (
        <View style={styles.soon}>
          <Text style={styles.soonText}>Coming soon</Text>
        </View>
      ) : (
        <Icon name="chevronRight" size={20} color={colors.onDark} />
      )}
    </Pressable>
  );
}

export default function Category() {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <RoadBackdrop />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space(8), paddingBottom: insets.bottom + space(6) }]}
        bounces={false}
      >
        <Logo />
        <View style={styles.choices}>
          <Text style={styles.title} accessibilityRole="header">
            What do you run?
          </Text>
          <Text style={styles.intro}>Choose your type of vehicle to get started.</Text>
          <CategoryTile icon="bus" title="Bus" detail="Daily cashing, costs and records" onPress={chooseBus} />
          <CategoryTile
            icon="taxi"
            title="Taxi"
            detail="Not available yet"
            comingSoon
            onPress={() => setMessage('Taxis are coming soon. For now, Digital Transport works with buses.')}
          />
          <CategoryTile
            icon="truck"
            title="Truck"
            detail="Not available yet"
            comingSoon
            onPress={() => setMessage('Trucks are coming soon. For now, Digital Transport works with buses.')}
          />
          {message ? (
            <Text style={styles.message} accessibilityRole="alert">
              {message}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.dark },
  content: { flexGrow: 1, paddingHorizontal: space(5) },
  choices: { flexGrow: 1, justifyContent: 'center', paddingTop: space(8) },
  title: { ...type.display, color: colors.onDark },
  intro: { ...type.body, color: colors.onDarkMuted, marginTop: space(2), marginBottom: space(6) },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    minHeight: TAP_TARGET + space(6),
    padding: space(3.5),
    marginBottom: space(3),
    borderWidth: 1,
    borderColor: 'rgba(242, 244, 247, 0.16)',
    borderRadius: radius.card,
    backgroundColor: 'rgba(242, 244, 247, 0.05)',
  },
  tileOpen: { borderColor: colors.primary, backgroundColor: 'rgba(34, 197, 94, 0.12)' },
  tilePressed: { opacity: 0.75 },
  tileIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: 'rgba(242, 244, 247, 0.08)',
  },
  tileIconOpen: { backgroundColor: colors.primary },
  tileText: { flex: 1 },
  tileTitle: { ...type.heading, color: colors.onDark },
  tileTitleSoon: { color: colors.onDarkMuted },
  tileDetail: { ...type.small, color: colors.onDarkMuted, marginTop: 2 },
  soon: {
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.pill,
    backgroundColor: 'rgba(242, 244, 247, 0.1)',
  },
  soonText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.onDark },
  message: { ...type.body, color: colors.onDark, marginTop: space(2) },
}));
