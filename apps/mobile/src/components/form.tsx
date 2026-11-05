import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/text';
import { colors, radius, space, TAP_TARGET, themedStyles } from '@/lib/theme';

export function TextField(props: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  maxLength: number;
  autoCapitalize?: 'characters' | 'words';
  keyboardType?: 'number-pad' | 'phone-pad';
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

/** A password box with Show and Hide, because mistyping on a small phone is the commonest failure. */
export function PasswordField(props: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  onSubmit?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.passwordBox}>
        <TextInput
          style={styles.passwordInput}
          value={props.value}
          onChangeText={props.onChange}
          onSubmitEditing={props.onSubmit}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={props.autoComplete}
          textContentType={props.autoComplete === 'new-password' ? 'newPassword' : 'password'}
          accessibilityLabel={props.label}
        />
        <Pressable
          onPress={() => setVisible(!visible)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={8}
          style={styles.passwordToggle}
        >
          <Text style={styles.passwordToggleText}>{visible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

export function MoneyField(props: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.textInput}
        value={props.value}
        onChangeText={props.onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.muted}
        accessibilityLabel={props.label}
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

const styles = themedStyles(() => StyleSheet.create({
  field: { marginBottom: space(4) },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text, marginBottom: space(1.5) },
  textInput: {
    minHeight: TAP_TARGET,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.control,
    paddingHorizontal: space(3.5),
    fontSize: 16,
    color: colors.text,
  },
  passwordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TAP_TARGET,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.control,
  },
  passwordInput: { flex: 1, minHeight: TAP_TARGET - 2, paddingHorizontal: space(3.5), fontSize: 16, color: colors.text },
  passwordToggle: { paddingHorizontal: space(3.5), minHeight: TAP_TARGET - 2, justifyContent: 'center' },
  passwordToggleText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space(4),
    marginBottom: space(2.5),
  },
  cardSelected: { borderColor: colors.primary, borderWidth: 2, padding: space(4) - 1 },
  cardDisabled: { opacity: 0.5 },
  cardTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: colors.text },
  cardDetail: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2 },
  hint: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: space(1) },
  choice: { flexDirection: 'row', gap: space(2), marginBottom: space(4) },
  option: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.control,
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
}));
