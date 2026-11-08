from typing import Any

import pytest

from ecopulse_common.consumer import PermanentError
from ecopulse_common.events import Envelope, EventType
from ecopulse_processor import __main__ as worker
from ecopulse_processor.regras import resolucoes_para_encerrar
from ecopulse_processor.servico import processar_resolucao


class _PoolProibido:
    def acquire(self) -> Any:
        raise AssertionError("o pool não deveria ser usado para payload inválido")


@pytest.mark.parametrize(
    ("confirmacoes", "esperado"),
    [(0, 1), (1, 1), (2, 2), (3, 3), (10, 3)],
)
def test_resolucoes_para_encerrar(confirmacoes: int, esperado: int) -> None:
    assert resolucoes_para_encerrar(confirmacoes) == esperado


async def test_payload_de_resolucao_invalido_falha_antes_do_pool() -> None:
    pool: Any = _PoolProibido()
    envelope = Envelope(
        type=EventType.RESOLUCAO_RECEBIDA,
        geohash="6gyf4b",
        payload={"client_id": "não-é-uuid"},
    )

    with pytest.raises(PermanentError):
        await processar_resolucao(pool, envelope)


async def test_despacha_relato_recebido(monkeypatch: pytest.MonkeyPatch) -> None:
    chamadas: list[str] = []

    async def fake_relato(pool: Any, envelope: Envelope) -> None:
        chamadas.append("relato")

    async def fake_resolucao(pool: Any, envelope: Envelope) -> None:
        chamadas.append("resolucao")

    monkeypatch.setattr(worker, "processar_relato", fake_relato)
    monkeypatch.setattr(worker, "processar_resolucao", fake_resolucao)
    pool: Any = object()

    await worker.despachar(
        pool,
        Envelope(type=EventType.RELATO_RECEBIDO, geohash="6gyf4b", payload={}),
    )

    assert chamadas == ["relato"]


async def test_despacha_resolucao_recebida(monkeypatch: pytest.MonkeyPatch) -> None:
    chamadas: list[str] = []

    async def fake_relato(pool: Any, envelope: Envelope) -> None:
        chamadas.append("relato")

    async def fake_resolucao(pool: Any, envelope: Envelope) -> None:
        chamadas.append("resolucao")

    monkeypatch.setattr(worker, "processar_relato", fake_relato)
    monkeypatch.setattr(worker, "processar_resolucao", fake_resolucao)
    pool: Any = object()

    await worker.despachar(
        pool,
        Envelope(type=EventType.RESOLUCAO_RECEBIDA, geohash="6gyf4b", payload={}),
    )

    assert chamadas == ["resolucao"]


async def test_despacha_tipo_desconhecido_vira_erro_permanente() -> None:
    pool: Any = _PoolProibido()
    envelope = Envelope(type=EventType.OCORRENCIA_CRIADA, geohash="6gyf4b", payload={})

    with pytest.raises(PermanentError):
        await worker.despachar(pool, envelope)
