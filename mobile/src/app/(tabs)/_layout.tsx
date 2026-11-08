import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';

import { TabBar } from '@/components';
import { ReportSheet } from '@/features/relatar/ReportSheet';
import { useAjustes } from '@/state/ajustes';
import { useAlertas } from '@/state/alertas';
import { useTema } from '@/theme/tema';

export default function TabsLayout() {
  const { cor } = useTema();
  const { naoLidos } = useAlertas();
  const { onboardingConcluido } = useAjustes();

  // Primeira abertura: pede as permissões (uma por tela) antes das abas
  if (!onboardingConcluido) return <Redirect href="/onboarding" />;
  return (
    <View style={{ flex: 1, backgroundColor: cor.background }}>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: cor.background } }}
        tabBar={(props) => <TabBar {...props} />}
      >
        <Tabs.Screen name="index" options={{ title: 'Agora' }} />
        <Tabs.Screen name="mapa" options={{ title: 'Mapa' }} />
        <Tabs.Screen
        name="alertas"
        options={{ title: 'Alertas', tabBarBadge: naoLidos > 0 ? naoLidos : undefined }}
      />
        <Tabs.Screen name="ajustes" options={{ title: 'Ajustes' }} />
      </Tabs>
      <ReportSheet />
    </View>
  );
}
