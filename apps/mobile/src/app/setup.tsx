import { randomUUID } from 'expo-crypto';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OptionCard, TextField } from '@/components/form';
import { BottomActions, Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, space } from '@/lib/theme';

type Path = 'owner' | 'driver';

export default function Setup() {
  const { account, refresh, signOut } = useAuth();
  const [name, setName] = useState(account?.displayName ?? '');
  const [path, setPath] = useState<Path | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Kept across retries, so a reply lost to bad signal cannot create a second business.
  const newBusiness = useRef({ businessId: randomUUID(), clientId: randomUUID() });

  const hasBusiness = !!account?.business;
  const ready =
    name.trim() !== '' &&
    (hasBusiness || (path === 'owner' && businessName.trim() !== '') || (path === 'driver' && code.trim() !== ''));

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await sendCommand('set_profile', null, { displayName: name.trim(), language: 'en' });
      if (!hasBusiness && path === 'owner') {
        const { businessId, clientId } = newBusiness.current;
        await sendCommand('create_business', null, { businessId, name: businessName.trim() }, clientId);
      } else if (!hasBusiness && path === 'driver') {
        await sendCommand('join_business', null, { code: code.trim() });
      }
    } catch (failed) {
      setError(reasonFor(failed));
    }
    // Also after a failure: the first attempt may have worked and only the reply was lost.
    await refresh();
    setSaving(false);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Set up your account' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField label="Your name" value={name} onChange={setName} placeholder="For example, Joseph Mwale" maxLength={80} />

        {hasBusiness ? null : (
          <>
            <Text style={styles.label}>How will you use the app?</Text>
            <View accessibilityRole="radiogroup">
              <OptionCard
                title="I own buses"
                detail="Create your business and invite your drivers."
                selected={path === 'owner'}
                onPress={() => setPath('owner')}
              />
              <OptionCard
                title="I drive for an owner"
                detail="Join with the invite code your owner gives you."
                selected={path === 'driver'}
                onPress={() => setPath('driver')}
              />
            </View>
          </>
        )}

        {!hasBusiness && path === 'owner' ? (
          <TextField
            label="Business name"
            value={businessName}
            onChange={setBusinessName}
            placeholder="For example, Banda Transport"
            maxLength={100}
          />
        ) : null}
        {!hasBusiness && path === 'driver' ? (
          <TextField
            label="Invite code"
            value={code}
            onChange={(text) => setCode(text.toUpperCase())}
            placeholder="6 letters and numbers"
            maxLength={12}
            autoCapitalize="characters"
          />
        ) : null}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <BottomActions>
        <Button label={saving ? 'Saving...' : 'Continue'} disabled={!ready || saving} onPress={save} />
        <Button variant="secondary" label="Sign out" onPress={signOut} />
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space(1.5) },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes },
});
