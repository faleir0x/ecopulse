import { Stack } from 'expo-router';

import { TelaLocal } from '@/features/local/TelaLocal';

export default function LocalScreen() {
  return (
    <>
      <Stack.Screen options={{ animation: 'slide_from_right' }} />
      <TelaLocal />
    </>
  );
}
