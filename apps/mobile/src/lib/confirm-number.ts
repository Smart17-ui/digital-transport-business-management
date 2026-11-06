import { Alert } from 'react-native';

/** Carries on straight away for a usual number. For an unusual one, asks first, because it goes into a permanent record. */
export function confirmNumber(warning: string | null, proceed: () => void): void {
  if (warning === null) {
    proceed();
    return;
  }
  Alert.alert('Is this right?', warning, [
    { text: 'Change it', style: 'cancel' },
    { text: 'Yes, it is right', onPress: proceed },
  ]);
}
