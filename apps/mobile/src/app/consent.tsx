import { randomUUID } from 'expo-crypto';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { BottomActions, Button, Note } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { reasonFor, sendCommand } from '@/lib/commands';
import { CONSENT_SCOPE, NOTICE_IS_DRAFT, NOTICE_SECTIONS, NOTICE_VERSION } from '@/lib/consent';
import { colors, space, themedStyles } from '@/lib/theme';

export default function Consent() {
  const { refresh, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const clientId = useRef(randomUUID());

  const agree = async () => {
    setError(null);
    setSaving(true);
    try {
      await sendCommand('record_consent', null, { scope: CONSENT_SCOPE, noticeVersion: NOTICE_VERSION }, clientId.current);
      await refresh();
    } catch (failure) {
      setError(reasonFor(failure));
    }
    setSaving(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Your data' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Please read this before you start.</Text>
        {NOTICE_IS_DRAFT ? <Note>This notice is a draft for testing and has not been approved yet.</Note> : null}
        {NOTICE_SECTIONS.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading} accessibilityRole="header">
              {section.heading}
            </Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <BottomActions>
        <Button label={saving ? 'Saving...' : 'I agree'} disabled={saving} onPress={agree} />
        <Button variant="secondary" label="No thanks, sign out" disabled={saving} onPress={signOut} />
      </BottomActions>
    </>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  content: { padding: space(4), paddingBottom: space(8) },
  intro: { fontSize: 16, lineHeight: 23, color: colors.muted },
  section: { marginTop: space(5) },
  heading: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: space(1) },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes, marginTop: space(4) },
}));
