import { parseKwacha, type HandoverKind } from '@dt/domain';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/icons';
import { BottomActions, Button, OfflineBanner } from '@/components/ui';
import { CONDUCTOR, money, OWNER, useSample } from '@/lib/sample';
import { colors, radius, space, TAP_TARGET } from '@/lib/theme';

const BUS_ID = 'baf';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;
const QUICK_AMOUNTS = [10_000, 20_000, 50_000];

/** Adds one key press to the typed amount, allowing at most two decimal places. */
function press(current: string, key: (typeof KEYS)[number]): string {
  if (key === 'back') return current.slice(0, -1);
  if (key === '.') return current.includes('.') ? current : `${current || '0'}.`;
  const [whole = '', fraction] = current.split('.');
  if (fraction !== undefined) return fraction.length < 2 ? current + key : current;
  if (whole.length >= 7) return current;
  return current === '0' ? key : current + key;
}

function kwachaText(amount: number): string {
  return (amount / 100).toFixed(amount % 100 === 0 ? 0 : 2);
}

export default function RecordHandover() {
  const params = useLocalSearchParams<{ kind: HandoverKind }>();
  const { dayFor, record, offline } = useSample();
  const day = dayFor(BUS_ID, 'driver');
  const [kind, setKind] = useState<HandoverKind>(params.kind === 'takings' ? 'takings' : 'remittance');
  const [typed, setTyped] = useState('');

  const amount = parseKwacha(typed === '' || typed.endsWith('.') ? `${typed}0` : typed);
  const payOwner = kind === 'remittance';
  const quick = payOwner && day.left > 0 ? [day.left, ...QUICK_AMOUNTS.filter((q) => q !== day.left)] : QUICK_AMOUNTS;

  const save = () => {
    record({ busId: BUS_ID, kind, amount });
    router.back();
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Record cash' }} />
      <OfflineBanner />

      <View style={styles.body}>
        <View style={styles.direction} accessibilityRole="radiogroup">
          <DirectionOption label="Me → Owner" selected={payOwner} onPress={() => setKind('remittance')} />
          <DirectionOption label={`${CONDUCTOR} → Me`} selected={!payOwner} onPress={() => setKind('takings')} />
        </View>

        <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1} accessibilityLiveRegion="polite">
          K{typed || '0'}
        </Text>
        <Text style={styles.helper}>
          {payOwner
            ? `${OWNER} confirms this in the app. Until then it shows as waiting.`
            : 'The owner confirms this in the app. Until then it shows as waiting.'}
        </Text>

        <View style={styles.quickRow}>
          {quick.map((q) => (
            <Pressable
              key={q}
              accessibilityRole="button"
              onPress={() => setTyped(kwachaText(q))}
              style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
            >
              <Text style={styles.quickText}>
                {payOwner && q === day.left ? `All ${money(q)}` : money(q)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.keypad}>
          {KEYS.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={key === 'back' ? 'Delete' : key}
              onPress={() => setTyped((current) => press(current, key))}
              style={({ pressed }) => [styles.key, pressed && styles.pressed]}
            >
              {key === 'back' ? <Icon name="backspace" /> : <Text style={styles.keyText}>{key}</Text>}
            </Pressable>
          ))}
        </View>
      </View>

      <BottomActions>
        <Button
          disabled={amount <= 0}
          label={amount > 0 ? `${offline ? 'Save' : 'Record'} ${money(amount)}` : 'Enter an amount'}
          onPress={save}
        />
      </BottomActions>
    </View>
  );
}

function DirectionOption(props: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={[styles.option, props.selected && styles.optionSelected]}
    >
      <Text style={[styles.optionText, props.selected && styles.optionTextSelected]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, padding: space(4) },
  direction: { flexDirection: 'row', gap: space(2) },
  option: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: 15, fontWeight: '700', color: colors.text },
  optionTextSelected: { color: colors.primaryText },
  amount: { fontSize: 52, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: space(4), fontVariant: ['tabular-nums'] },
  helper: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: space(1), marginBottom: space(3) },
  quickRow: { flexDirection: 'row', gap: space(2), marginBottom: space(3) },
  quick: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: space(1),
  },
  quickText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  keypad: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space(2), alignContent: 'stretch' },
  key: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  keyText: { fontSize: 24, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
