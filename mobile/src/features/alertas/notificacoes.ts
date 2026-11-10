/**
 * Configuração das notificações locais: canal Android, categoria com ações e o handler que
 * evita repetir push remoto com o app aberto. Importar este módulo não executa nada; o layout
 * raiz chama `configurarNotificacoes()` uma vez.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { AppState, Platform } from 'react-native';

// Canal Android próprio, prioridade alta (banner por cima de outros apps), com duas ações
export const CANAL = 'alertas-risco';
export const CATEGORIA = 'alerta-risco';
export const ACAO_SILENCIAR = 'silenciar-1h';

let configurado = false;

/** Idempotente: canal, categoria e handler só são registrados na primeira chamada. */
export function configurarNotificacoes(): void {
  if (configurado) return;
  configurado = true;

  void (async () => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CANAL, {
          name: 'Alertas de risco',
          importance: AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 150, 250],
        });
      }
      await Notifications.setNotificationCategoryAsync(CATEGORIA, [
        { identifier: 'ver-no-mapa', buttonTitle: 'Ver no mapa', options: { opensAppToForeground: true } },
        { identifier: ACAO_SILENCIAR, buttonTitle: 'Silenciar 1 h', options: { opensAppToForeground: false } },
      ]);
    } catch {
      // Sem canal/categoria a notificação cai no canal padrão, sem ações
    }
  })();

  // Push remoto com o app aberto não repete o alerta local (o WebSocket já avisou)
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const gatilho = notification.request.trigger;
      const remota = gatilho != null && 'type' in gatilho && gatilho.type === 'push';
      if (remota && AppState.currentState === 'active') {
        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      };
    },
  });
}
