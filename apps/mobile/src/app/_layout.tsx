import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SampleProvider } from '@/lib/sample';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SampleProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </SampleProvider>
  );
}
