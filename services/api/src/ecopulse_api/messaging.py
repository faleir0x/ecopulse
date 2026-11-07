import aio_pika

from ecopulse_common.config import Settings

RABBIT_URL = Settings().rabbit_url

EXCHANGE = "relatos.exchange"
QUEUE = "relatos"
DLX = "relatos.dlx"
DLQ = "relatos.dlq"


async def connect() -> aio_pika.abc.AbstractRobustConnection:
    return await aio_pika.connect_robust(RABBIT_URL)


async def declare_topology(
    channel: aio_pika.abc.AbstractChannel,
) -> aio_pika.abc.AbstractExchange:
    """Cria exchange, fila principal (durável) e a Dead Letter Queue."""
    dlx = await channel.declare_exchange(DLX, aio_pika.ExchangeType.DIRECT, durable=True)
    dlq = await channel.declare_queue(DLQ, durable=True)
    await dlq.bind(dlx, routing_key=QUEUE)

    exchange = await channel.declare_exchange(EXCHANGE, aio_pika.ExchangeType.DIRECT, durable=True)
    queue = await channel.declare_queue(
        QUEUE,
        durable=True,
        arguments={
            "x-dead-letter-exchange": DLX,
            "x-dead-letter-routing-key": QUEUE,
        },
    )
    await queue.bind(exchange, routing_key=QUEUE)
    return exchange
