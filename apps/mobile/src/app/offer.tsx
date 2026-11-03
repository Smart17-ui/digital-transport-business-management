import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomActions, Button, Card, MoneyRow } from '@/components/ui';
import { offerSummary, termsAreReadable } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { fetchOffer, useScreenData } from '@/lib/business';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, radius, space } from '@/lib/theme';

export default function Offer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { account } = useAuth();
  const load = useCallback(() => fetchOffer(id), [id]);
  const { data, failed, reload } = useScreenData(load);

  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One per answer, so a retry after lost signal repeats that answer and a change of mind is a new command.
  const attempt = useRef({ accept: randomUUID(), decline: randomUUID() });

  const arrangement = data?.arrangement;
  const answered = !!arrangement && arrangement.status !== 'proposed';
  const unreadable = !!arrangement && !termsAreReadable(arrangement.type, arrangement.terms);
  const open = !!arrangement && !answered && !unreadable;
  const summary = open ? offerSummary(arrangement) : null;

  const respond = async (accept: boolean) => {
    const businessId = account?.business?.id;
    if (!businessId || !arrangement) return;
    setError(null);
    setSaving(true);
    try {
      await sendCommand(
        'respond_arrangement',
        businessId,
        { arrangementId: arrangement.id, accept, reason: accept ? null : reason.trim() || null },
        accept ? attempt.current.accept : attempt.current.decline,
      );
      router.back();
    } catch (failure) {
      setError(reasonFor(failure));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Offer from your owner' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {failed && !data ? (
          <View style={styles.problem}>
            <Text style={styles.message}>Could not load this offer. Check your signal and try again.</Text>
            <Button variant="secondary" label="Try again" onPress={reload} />
          </View>
        ) : null}

        {data && (answered || !arrangement) ? <Text style={styles.message}>This offer has already been answered.</Text> : null}
        {!answered && unreadable ? (
          <Text style={styles.message}>This offer could not be read, so it cannot be accepted yet. Please ask your owner about it.</Text>
        ) : null}

        {summary ? (
          <>
            <Text style={styles.plate}>{data?.plate}</Text>
            <Card style={styles.headlineCard}>
              <Text style={styles.headline} adjustsFontSizeToFit numberOfLines={1}>
                {summary.headline}
              </Text>
              <Text style={styles.headlineLabel}>{summary.headlineLabel}</Text>
            </Card>
            <Card style={styles.rows}>
              {summary.rows.map((row, i) => (
                <MoneyRow key={row.label} label={row.label} value={row.value} last={i === summary.rows.length - 1} />
              ))}
            </Card>
            <Text style={styles.small}>These terms only change if your owner sends a new offer and you accept it.</Text>

            {declining ? (
              <View style={styles.decline}>
                <Text style={styles.label}>Tell your owner why (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="For example, the target is too high"
                  placeholderTextColor={colors.muted}
                  maxLength={300}
                  multiline
                  autoFocus
                  accessibilityLabel="Reason for declining"
                />
              </View>
            ) : null}

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {open ? (
        <BottomActions>
          {declining ? (
            <>
              <Button label={saving ? 'Sending...' : 'Decline this offer'} disabled={saving} onPress={() => respond(false)} />
              <Button variant="secondary" label="Go back" disabled={saving} onPress={() => setDeclining(false)} />
            </>
          ) : (
            <>
              <Button label={saving ? 'Sending...' : 'Accept these terms'} disabled={saving} onPress={() => respond(true)} />
              <Button variant="secondary" label="Decline" disabled={saving} onPress={() => setDeclining(true)} />
            </>
          )}
        </BottomActions>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  problem: { gap: space(3) },
  message: { fontSize: 15, lineHeight: 22, color: colors.text },
  plate: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: space(3) },
  headlineCard: { alignItems: 'center', paddingVertical: space(5) },
  headline: { fontSize: 48, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  headlineLabel: { fontSize: 16, lineHeight: 23, color: colors.muted, textAlign: 'center', marginTop: space(1) },
  rows: { paddingVertical: 0, marginTop: space(3) },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: space(4) },
  decline: { marginTop: space(5) },
  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space(1.5) },
  input: {
    minHeight: 88,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: radius.control,
    padding: space(3),
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes, marginTop: space(3) },
});
