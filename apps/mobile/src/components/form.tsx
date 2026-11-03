import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, space, TAP_TARGET } from '@/lib/theme';

export function TextField(props: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  maxLength: number;
  autoCapitalize?: 'characters' | 'words';
  keyboardType?: 'number-pad';
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.textInput}
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        maxLength={props.maxLength}
        autoCapitalize={props.autoCapitalize ?? 'words'}
        autoCorrect={false}
        keyboardType={props.keyboardType}
        accessibilityLabel={props.label}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

export function MoneyField(props: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.muted}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

/** One choice from a short list that needs a line of explanation. Wrap a set in a View with the radiogroup role. */
export function OptionCard(props: {
  title: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected, disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.card, props.selected && styles.cardSelected, props.disabled && styles.cardDisabled]}
    >
      <Text style={styles.cardTitle}>{props.title}</Text>
      <Text style={styles.cardDetail}>{props.detail}</Text>
    </Pressable>
  );
}

export function Choice<T extends string>(props: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  /** Lets a longer list flow onto more rows. */
  wrap?: boolean;
}) {
  return (
    <View style={[styles.choice, props.wrap && styles.choiceWrap]}>
      {props.options.map((o) => {
        const selected = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => props.onChange(o.value)}
            style={[styles.option, props.wrap && styles.optionWrap, selected && styles.optionSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: space(4) },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space(1.5) },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    fontSize: 20,
    color: colors.text,
  },
  textInput: {
    minHeight: TAP_TARGET,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: radius.control,
    paddingHorizontal: space(3.5),
    fontSize: 17,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space(4),
    marginBottom: space(2.5),
  },
  cardSelected: { borderColor: colors.primary, borderWidth: 2 },
  cardDisabled: { opacity: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardDetail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  hint: { fontSize: 13, color: colors.muted, marginTop: space(1) },
  choice: { flexDirection: 'row', gap: space(2), marginBottom: space(4) },
  option: {
    flex: 1,
    paddingVertical: space(3),
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  choiceWrap: { flexWrap: 'wrap' },
  optionWrap: { flexGrow: 1, flexBasis: '45%', paddingHorizontal: space(2) },
  optionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: 14, fontWeight: '600', color: colors.text },
  optionTextSelected: { color: colors.primaryText },
});
