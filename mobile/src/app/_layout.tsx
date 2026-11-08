import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { fontes } from '@/theme/fontes';
import { RelatosProvider } from '@/state/relatos';
import { UiProvider } from '@/state/ui';
import { TemaProvider, useTema } from '@/theme/tema';

const clienteQuery = new QueryClient({
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } },
});

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [carregadas, erro] = useFonts(fontes);

  useEffect(() => {
    if (carregadas || erro) {
      void SplashScreen.hideAsync();
    }
  }, [carregadas, erro]);

  if (!carregadas && !erro) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={clienteQuery}>
        <TemaProvider>
          <UiProvider>
            <RelatosProvider>
              <Navegacao />
            </RelatosProvider>
          </UiProvider>
        </TemaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/** Barra de status e fundo seguem o tema escolhido no app, não só o do sistema. */
function Navegacao() {
  const { esquema, cor } = useTema();
  return (
    <>
      <StatusBar style={esquema === 'escuro' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cor.background } }} />
    </>
  );
}
