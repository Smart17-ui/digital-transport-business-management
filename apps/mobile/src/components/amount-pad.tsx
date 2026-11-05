import { parseKwacha } from '@dt/domain';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/text';
import { colors, radius, space, TAP_TARGET, themedStyles } from '@/lib/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

/** Adds one key press to the typed amount, allowing at most two decimal places. */
function press(current: string, key: (typeof KEYS)[number]): string {
  if (key === 'back') return current.slice(0, -1);
  if (key === '.') return current.includes('.') ? current : `${current || '0'}.`;
  const [whole = '', fraction] = current.split('.');
  if (fraction !== undefined) return fraction.length < 2 ? current + key : current;
  if (whole.length >= 7) return current;
  return current === '0' ? key : current + key;
}

/** The typed amount in ngwee, treating an empty or unfinished amount as far as it goes. */
export function typedAmount(typed: string): number {
  return parseKwacha(typed === '' || typed.endsWith('.') ? `${typed}0` : typed);
}

/** Large keys for typing an amount with one hand. */
export function AmountPad({ onChange }: { onChange: (update: (current: string) => string) => void }) {
  return (
    <View style={styles.keypad}>
      {KEYS.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={key === 'back' ? 'Delete' : key}
          onPress={() => onChange((current) => press(current, key))}
          style={({ pressed }) => [styles.key, pressed && styles.pressed]}
        >
          {key === 'back' ? <Icon name="backspace" /> : <Text style={styles.keyText}>{key}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
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
}));
