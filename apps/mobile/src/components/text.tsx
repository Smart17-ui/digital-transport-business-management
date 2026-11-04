import type { ComponentProps } from 'react';
import { Text as NativeText, TextInput as NativeTextInput, StyleSheet, type TextStyle } from 'react-native';

const FAMILY_BY_WEIGHT: Record<string, string> = {
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  '800': 'Inter_700Bold',
  bold: 'Inter_700Bold',
};

/**
 * Android ignores fontWeight with a bundled font, because each weight is its own
 * file, so the weight in a style chooses the file here. Using these instead of
 * React Native's also stops a phone's own font setting from replacing the app's.
 */
function fontStyle(style: ComponentProps<typeof NativeText>['style']): TextStyle {
  const weight = StyleSheet.flatten(style)?.fontWeight;
  return { fontFamily: FAMILY_BY_WEIGHT[String(weight)] ?? 'Inter_400Regular', fontWeight: 'normal' };
}

export function Text({ style, ...props }: ComponentProps<typeof NativeText>) {
  return <NativeText {...props} style={[style, fontStyle(style)]} />;
}

export function TextInput({ style, ...props }: ComponentProps<typeof NativeTextInput>) {
  return <NativeTextInput {...props} style={[style, fontStyle(style)]} />;
}
