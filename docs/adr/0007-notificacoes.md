# ADR 0007: Alertas por WebSocket e notificação local

**Status:** aceito

## Contexto
A proposta pede WebSockets e push notifications por raio geográfico. O Expo Go não suporta push remoto no Android.

## Decisão
O serviço `realtime` entrega os alertas por WebSocket; o app exibe uma notificação local (`expo-notifications`). Push remoto (Expo Push/FCM) fica como extensão via build EAS na nuvem.

## Consequências
- Funciona com o app aberto ou em segundo plano recente; com o app fechado, só com o push remoto.
