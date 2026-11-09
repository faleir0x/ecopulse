import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

export type PermissaoNotificacao = 'verificando' | 'concedida' | 'negada';

/**
 * Permissão de notificação, conferida de novo quando o app volta ao primeiro plano (o usuário
 * pode ter ligado nas configurações do sistema). `ativar` pede; se o sistema não deixa pedir
 * de novo, abre as configurações do app.
 */
export function usePermissaoNotificacao(): {
  permissao: PermissaoNotificacao;
  ativar: () => Promise<void>;
} {
  const [permissao, setPermissao] = useState<PermissaoNotificacao>('verificando');

  useEffect(() => {
    let ativo = true;
    const conferir = () => {
      Notifications.getPermissionsAsync()
        .then((resposta) => {
          if (ativo) setPermissao(resposta.granted ? 'concedida' : 'negada');
        })
        .catch(() => {
          if (ativo) setPermissao('negada');
        });
    };
    conferir();
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') conferir();
    });
    return () => {
      ativo = false;
      assinatura.remove();
    };
  }, []);

  const ativar = useCallback(async () => {
    try {
      const resposta = await Notifications.requestPermissionsAsync();
      if (resposta.granted) {
        setPermissao('concedida');
        return;
      }
      if (resposta.canAskAgain === false) await Linking.openSettings();
    } catch {
      await Linking.openSettings().catch(() => undefined);
    }
  }, []);

  return { permissao, ativar };
}
