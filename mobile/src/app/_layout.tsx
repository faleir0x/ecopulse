import NetInfo from '@react-native-community/netinfo';
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useTelemetria } from '@/features/telemetria';
import { fontes } from '@/theme/fontes';
import { AjustesProvider } from '@/state/ajustes';
import { AlertasProvider } from '@/state/alertas';
import { RelatosProvider } from '@/state/relatos';
import { UiProvider } from '@/state/ui';
import { TemaProvider, useTema } from '@/theme/tema';

// React Query em React Native: sem isso ele continua consultando em segundo plano e, offline,
// falha/repetir em vez de pausar. Configurado uma vez, fora do componente.
focusManager.setEventListener((definirFoco) => {
  const assinatura = AppState.addEventListener('change', (estado) => {
    definirFoco(estado === 'active');
  });
  return () => assinatura.remove();
});

onlineManager.setEventListener((definirOnline) => {
  return NetInfo.addEventListener((rede) => {
    definirOnline(rede.isConnected !== false && rede.isInternetReachable !== false);
  });
});

const clienteQuery = new QueryClient({
  defaultOptions: { queries: { retry: 2 } },
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
            <AjustesProvider>
              <RelatosProvider>
                <AlertasProvider>
                  <Navegacao />
                </AlertasProvider>
              </RelatosProvider>
            </AjustesProvider>
          </UiProvider>
        </TemaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/** Barra de status e fundo seguem o tema escolhido no app, não só o do sistema. */
function Navegacao() {
  const { esquema, cor } = useTema();
  useTelemetria();
  return (
    <>
      <StatusBar style={esquema === 'escuro' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cor.background } }} />
    </>
  );
}
