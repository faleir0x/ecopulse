# ADR 0007: Alertas por WebSocket, notificação local e push remoto (FCM)

**Status:** aceito (revisado na Fase 6: push remoto implementado)

## Contexto
A proposta pede WebSockets e push notifications por raio geográfico. O Expo Go não recebe push remoto no Android; o APK (Fase 6.4) recebe.

## Decisão
- **App aberto ou em segundo plano recente:** o `realtime` entrega os alertas por WebSocket e o app mostra uma notificação local (`expo-notifications`), com as regras de raio, limiar e tipos no próprio app.
- **App fechado (só no APK):** o serviço `notifier` consome `ocorrencia.criada/.atualizada` (fila quorum própria), busca no PostGIS os aparelhos cujo raio alcança a ocorrência (`ST_DWithin`) e envia pelo Firebase Cloud Messaging (API HTTP v1, conta de serviço com JWT RS256 → access token em cache).
- O app registra o aparelho em `PUT /v1/aparelhos/{id}` com o token FCM, a posição arredondada a ~100 m e os ajustes; renova ao andar 500 m, ao mudar ajustes/token/silêncio e uma vez por dia. Registro sem renovação há 7 dias é ignorado e apagado.
- **Sem duplicar:** marca `push:{ocorrência}:{severidade}:{aparelho}` com `SET NX` no Redis Cluster (a mesma severidade não avisa de novo; uma piora sim; reentrega do RabbitMQ não duplica). Com o app em primeiro plano o push é descartado, porque o WebSocket já avisou; a tag `ocorrencia-{id}` faz uma piora substituir o aviso anterior na bandeja.
- Expo Push foi descartado: seria mais um intermediário externo, e o FCM direto mantém a chave só no servidor.

## Consequências
- O servidor passa a guardar uma posição aproximada por aparelho (sem login, apagada em 7 dias).
- Token inválido (`UNREGISTERED`) apaga o registro; falha transitória do FCM tenta 3 vezes e desiste (push é melhor esforço; o alerta continua no WebSocket e na lista ao abrir o app).
- Sem o JSON da conta de serviço o `notifier` roda em modo simulado (CI e quem não configurou o Firebase).
