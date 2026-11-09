"""Entrada do serviço: python -m ecopulse_notifier

- configure_logging("notifier"), pool do banco (ecopulse_common.db.create_pool), Redis
  Cluster (ecopulse_common.cache.create_cluster + initialize), conexão RabbitMQ
  (messaging.connect), canal com set_qos(prefetch_count=20)
- exchange messaging.EVENTS_EXCHANGE (topic, durável); fila FILA durável com
  arguments=messaging.QUORUM, ligada com as chaves BINDINGS
- enviador: fcm.carregar_credenciais(settings.firebase_credenciais) → fcm.ClienteFcm com um
  httpx.AsyncClient próprio; None → fcm.EnviadorSimulado e log "modo simulado"
- consumo (sem auto-ack), por mensagem:
  - Envelope.model_validate_json + servico.notificar(..., agora=datetime.now(UTC)) → ack
  - ValueError/ValidationError (evento inválido) → loga warning e ack (descarta)
  - RedisError, asyncpg.PostgresError, OSError → loga warning, espera 1 s e
    nack(requeue=True)
- tarefa em paralelo: a cada INTERVALO_LIMPEZA_S chama repositorio.apagar_antigos (loga e
  continua em erro)
- SIGTERM/SIGINT: para de consumir, cancela a tarefa, fecha httpx, conexão, Redis e pool
"""

FILA = "notifier.ocorrencias"
BINDINGS = ("ocorrencia.criada", "ocorrencia.atualizada")
INTERVALO_LIMPEZA_S = 3600

# TODO(worker): implementar main() e o bloco if __name__ == "__main__": asyncio.run(main())
