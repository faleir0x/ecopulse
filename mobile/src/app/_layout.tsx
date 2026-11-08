import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { fontes } from '@/theme/fontes';
import { TemaProvider, useTema } from '@/theme/tema';

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
    <TemaProvider>
      <Navegacao />
    </TemaProvider>
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
