from typing import Any

import pytest

from ecopulse_common import geohash
from ecopulse_common.consumer import PermanentError
from ecopulse_common.events import Envelope, EventType
from ecopulse_processor.servico import processar_relato


class _PoolProibido:
    def acquire(self) -> Any:
        raise AssertionError("o pool não deveria ser usado para payload inválido")


async def test_payload_invalido_falha_antes_de_tocar_no_pool() -> None:
    pool: Any = _PoolProibido()
    envelope = Envelope(
        type=EventType.RELATO_RECEBIDO,
        geohash=geohash.encode(-23.5505, -46.6333, geohash.CELL_PRECISION),
        payload={"client_id": "não-é-uuid"},
    )

    with pytest.raises(PermanentError):
        await processar_relato(pool, envelope)
