import { Stack } from 'expo-router';

import { TelaMeusRelatos } from '@/features/meusRelatos/TelaMeusRelatos';

export default function MeusRelatosScreen() {
  return (
    <>
      <Stack.Screen options={{ animation: 'slide_from_right' }} />
      <TelaMeusRelatos />
    </>
  );
}
