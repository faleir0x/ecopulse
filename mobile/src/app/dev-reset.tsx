import { Redirect } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { useEffect } from 'react';
import { DevSettings } from 'react-native';

/**
 * Só em desenvolvimento: apaga as preferências guardadas (introdução vista, ajustes, alertas,
 * local escolhido, tema, id do aparelho) e recarrega o app, para repetir a experiência de
 * primeira vez. Os relatos da outbox ficam. No APK a rota só redireciona para o início.
 */
export default function DevResetScreen() {
  useEffect(() => {
    if (!__DEV__) return;
    try {
      Storage.clearSync();
    } catch {
      // Sem armazenamento não há o que limpar
    }
    DevSettings.reload();
  }, []);

  if (!__DEV__) return <Redirect href="/" />;
  return null;
}
