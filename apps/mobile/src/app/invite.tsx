import { randomUUID } from 'expo-crypto';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet } from 'react-native';
import { Text } from '@/components/text';
import { BottomActions, Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, space, themedStyles } from '@/lib/theme';

export default function Invite() {
  const { account } = useAuth();
  const [invite, setInvite] = useState<{ code: string; expires: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Kept across retries, so a reply lost to bad signal cannot waste a code.
  const attempt = useRef(randomUUID());

  const create = async () => {
    const businessId = account?.business?.id;
    if (!businessId) return;
    setError(null);
    setCreating(true);
    try {
      const data = await sendCommand('create_invite', businessId, { role: 'driver' }, attempt.current);
      attempt.current = randomUUID();
      const expires = new Date(String(data.expiresAt)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
      setInvite({ code: String(data.code), expires });
    } catch (failed) {
      setError(reasonFor(failed));
    }
    setCreating(false);
  };

  const share = () => {
    if (!invite) return;
    void Share.share({
      message:
        `Join ${account?.business?.name} on Digital Transport. Open the app, choose "I drive for an owner" ` +
        `and enter this code: ${invite.code}. It works once and expires on ${invite.expires}.`,
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Invite a driver' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {invite ? (
          <Card style={styles.card}>
            <Text style={styles.detail}>Give your driver this code</Text>
            <Text style={styles.code} selectable accessibilityLabel={`Invite code ${invite.code.split('').join(' ')}`}>
              {invite.code}
            </Text>
            <Text style={styles.detail}>It works once and expires on {invite.expires}.</Text>
          </Card>
        ) : (
          <Text style={styles.intro}>
            Create a code for one driver. They enter it when they set up their account, and then they join your business.
          </Text>
        )}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <BottomActions>
        {invite ? (
          <>
            <Button label="Share code" onPress={share} />
            <Button
              variant="secondary"
              label={creating ? 'Creating...' : 'Create a code for another driver'}
              disabled={creating}
              onPress={create}
            />
          </>
        ) : (
          <Button label={creating ? 'Creating...' : 'Create invite code'} disabled={creating} onPress={create} />
        )}
      </BottomActions>
    </>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  content: { padding: space(4), paddingBottom: space(8), flexGrow: 1 },
  intro: { fontSize: 16, lineHeight: 23, color: colors.muted },
  card: { alignItems: 'center', gap: space(2), paddingVertical: space(6) },
  detail: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center' },
  code: { fontSize: 40, fontWeight: '800', letterSpacing: 4, color: colors.text },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes, marginTop: space(3) },
}));
