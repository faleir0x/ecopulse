import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

import asyncpg
import pytest
from ecopulse_notifier import mensagem, repositorio, servico
from ecopulse_notifier.fcm import ErroFcm, ErroPermanente, TokenInvalido
from ecopulse_notifier.repositorio import Destino
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import geohash
from ecopulse_common.events import (
    Envelope,
    EventType,
    OcorrenciaPayload,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)

AGORA = datetime(2026, 11, 9, 12, tzinfo=UTC)
POOL = cast(asyncpg.Pool, object())


class RedisFalso:
    def __init__(self) -> None:
        self.dados: dict[str, str] = {}
        self.expiracao: dict[str, int] = {}

    async def set(
        self, chave: str, valor: str, *, nx: bool = False, ex: int | None = None
    ) -> bool | None:
        if nx and chave in self.dados:
            return None
        self.dados[chave] = valor
        if ex is not None:
            self.expiracao[chave] = ex
        return True

    async def delete(self, *chaves: str) -> int:
        return sum(1 for chave in chaves if self.dados.pop(chave, None) is not None)


class EnviadorFalso:
    def __init__(self, erros: dict[str, list[Exception | None]] | None = None) -> None:
        self.mensagens: list[dict[str, Any]] = []
        self._erros = {token: list(fila) for token, fila in (erros or {}).items()}

    async def enviar(self, mensagem_fcm: dict[str, Any]) -> None:
        fila = self._erros.get(str(mensagem_fcm["token"]))
        if fila:
            erro = fila.pop(0)
            if erro is not None:
                raise erro
        self.mensagens.append(mensagem_fcm)


@pytest.fixture
def esperas(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    dormidas: list[float] = []

    async def fake_sleep(segundos: float) -> None:
        dormidas.append(segundos)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    return dormidas


def _destino(*, token: str | None = None, distancia_m: float = 300.0) -> Destino:
    return Destino(
        aparelho_id=uuid4(),
        token=token or f"token-{uuid4()}",
        distancia_m=distancia_m,
    )


def _ocorrencia(
    *,
    severidade: Severidade = Severidade.ALTO,
    status: StatusOcorrencia = StatusOcorrencia.ATIVA,
    expira_em: datetime | None = None,
) -> OcorrenciaPayload:
    return OcorrenciaPayload(
        id=1,
        tipo=TipoRisco.ALAGAMENTO,
        severidade=severidade,
        latitude=-23.5505,
        longitude=-46.6333,
        geohash=geohash.encode(-23.5505, -46.6333, geohash.CELL_PRECISION),
        confirmacoes=3,
        status=status,
        criada_em=AGORA,
        atualizada_em=AGORA,
        expira_em=expira_em or AGORA + timedelta(hours=1),
    )


def _envelope(
    ocorrencia: OcorrenciaPayload | None = None,
    *,
    tipo: EventType = EventType.OCORRENCIA_CRIADA,
) -> Envelope:
    dados = ocorrencia or _ocorrencia()
    return Envelope(
        type=tipo,
        geohash=geohash.encode(dados.latitude, dados.longitude, geohash.CELL_PRECISION),
        payload=dados.model_dump(mode="json"),
    )


def _destinos(monkeypatch: pytest.MonkeyPatch, itens: list[Destino]) -> list[bool]:
    chamadas: list[bool] = []

    async def fake_destinos(*_: object) -> list[Destino]:
        chamadas.append(True)
        return itens

    monkeypatch.setattr(repositorio, "destinos", fake_destinos)
    return chamadas


def _remover(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    removidos: list[str] = []

    async def fake_remover(_pool: asyncpg.Pool, token: str) -> None:
        removidos.append(token)

    monkeypatch.setattr(repositorio, "remover_token", fake_remover)
    return removidos


def _chave(destino: Destino, severidade: str = "alto") -> str:
    return servico.chave_enviado(1, severidade, str(destino.aparelho_id))


async def test_envia_para_cada_destino(
    monkeypatch: pytest.MonkeyPatch, esperas: list[float]
) -> None:
    itens = [_destino(distancia_m=350), _destino(distancia_m=1_200)]
    _destinos(monkeypatch, itens)
    removidos = _remover(monkeypatch)
    redis = RedisFalso()
    enviador = EnviadorFalso()

    enviados = await servico.notificar(
        _envelope(), POOL, cast(RedisCluster, redis), enviador, AGORA
    )

    assert enviados == 2
    assert [item["token"] for item in enviador.mensagens] == [d.token for d in itens]
    assert set(redis.dados) == {_chave(d) for d in itens}
    assert removidos == []
    assert esperas == []


async def test_mesma_severidade_nao_repete(
    monkeypatch: pytest.MonkeyPatch, esperas: list[float]
) -> None:
    _destinos(monkeypatch, [_destino()])
    _remover(monkeypatch)
    redis = RedisFalso()
    enviador = EnviadorFalso()
    envelope = _envelope()

    primeiro = await servico.notificar(envelope, POOL, cast(RedisCluster, redis), enviador, AGORA)
    segundo = await servico.notificar(envelope, POOL, cast(RedisCluster, redis), enviador, AGORA)

    assert (primeiro, segundo) == (1, 0)
    assert len(enviador.mensagens) == 1


async def test_piora_envia_de_novo(monkeypatch: pytest.MonkeyPatch, esperas: list[float]) -> None:
    _destinos(monkeypatch, [_destino()])
    _remover(monkeypatch)
    redis = RedisFalso()
    enviador = EnviadorFalso()

    primeiro = await servico.notificar(
        _envelope(_ocorrencia(severidade=Severidade.ALTO)),
        POOL,
        cast(RedisCluster, redis),
        enviador,
        AGORA,
    )
    segundo = await servico.notificar(
        _envelope(_ocorrencia(severidade=Severidade.CRITICO)),
        POOL,
        cast(RedisCluster, redis),
        enviador,
        AGORA,
    )

    assert (primeiro, segundo) == (1, 1)
    assert len(enviador.mensagens) == 2


async def test_evento_expirado_nao_consulta_destinos(
    monkeypatch: pytest.MonkeyPatch, esperas: list[float]
) -> None:
    chamadas = _destinos(monkeypatch, [_destino()])
    removidos = _remover(monkeypatch)
    enviador = EnviadorFalso()
    envelope = _envelope(tipo=EventType.OCORRENCIA_EXPIRADA)

    enviados = await servico.notificar(
        envelope, POOL, cast(RedisCluster, RedisFalso()), enviador, AGORA
    )

    assert enviados == 0
    assert chamadas == []
    assert removidos == []
    assert enviador.mensagens == []


async def test_ocorrencia_expirada_nao_consulta_destinos(
    monkeypatch: pytest.MonkeyPatch, esperas: list[float]
) -> None:
    chamadas = _destinos(monkeypatch, [_destino()])
    _remover(monkeypatch)
    enviador = EnviadorFalso()

    enviados = await servico.notificar(
        _envelope(_ocorrencia(status=StatusOcorrencia.EXPIRADA)),
        POOL,
        cast(RedisCluster, RedisFalso()),
        enviador,
        AGORA,
    )

    assert enviados == 0
    assert chamadas == []
    assert enviador.mensagens == []


async def test_token_invalido_remove_aparelho_e_marca(
    monkeypatch: pytest.MonkeyPatch, esperas: list[float]
) -> None:
    destino = _destino()
    _destinos(monkeypatch, [destino])
    removidos = _remover(monkeypatch)
    redis = RedisFalso()
    enviador = EnviadorFalso({destino.token: [TokenInvalido("UNREGISTERED")]})

    enviados = await servico.notificar(
        _envelope(), POOL, cast(RedisCluster, redis), enviador, AGORA
    )

    assert enviados == 0
    assert removidos == [destino.token]
    assert redis.dados == {}
    assert enviador.mensagens == []
    assert esperas == []


async def test_erro_transitorio_passa_na_segunda_tentativa(
    monkeypatch: pytest.MonkeyPatch, esperas: list[float]
) -> None:
    destino = _destino()
    _destinos(monkeypatch, [destino])
    _remover(monkeypatch)
    redis = RedisFalso()
    enviador = EnviadorFalso({destino.token: [ErroFcm("rede"), None]})

    enviados = await servico.notificar(
        _envelope(), POOL, cast(RedisCluster, redis), enviador, AGORA
    )

    assert enviados == 1
    assert len(enviador.mensagens) == 1
    assert esperas == [servico.ESPERAS_S[0]]
    assert _chave(destino) in redis.dados


async def test_erro_transitorio_esgotado_apaga_marca_e_segue(
    monkeypatch: pytest.MonkeyPatch, esperas: list[float]
) -> None:
    primeiro = _destino()
    segundo = _destino()
    _destinos(monkeypatch, [primeiro, segundo])
    removidos = _remover(monkeypatch)
    redis = RedisFalso()
    enviador = EnviadorFalso({primeiro.token: [ErroFcm("rede")] * 3})

    enviados = await servico.notificar(
        _envelope(), POOL, cast(RedisCluster, redis), enviador, AGORA
    )

    assert enviados == 1
    assert esperas == list(servico.ESPERAS_S)
    assert _chave(primeiro) not in redis.dados
    assert _chave(segundo) in redis.dados
    assert removidos == []
    assert [item["token"] for item in enviador.mensagens] == [segundo.token]


async def test_erro_permanente_apaga_marca_e_segue(
    monkeypatch: pytest.MonkeyPatch, esperas: list[float]
) -> None:
    primeiro = _destino()
    segundo = _destino()
    _destinos(monkeypatch, [primeiro, segundo])
    _remover(monkeypatch)
    redis = RedisFalso()
    enviador = EnviadorFalso({primeiro.token: [ErroPermanente("400")]})

    enviados = await servico.notificar(
        _envelope(), POOL, cast(RedisCluster, redis), enviador, AGORA
    )

    assert enviados == 1
    assert esperas == []
    assert _chave(primeiro) not in redis.dados
    assert _chave(segundo) in redis.dados


async def test_ttl_da_marca_respeita_o_minimo(
    monkeypatch: pytest.MonkeyPatch, esperas: list[float]
) -> None:
    destino = _destino()
    _destinos(monkeypatch, [destino])
    _remover(monkeypatch)
    redis = RedisFalso()
    enviador = EnviadorFalso()

    await servico.notificar(
        _envelope(_ocorrencia(expira_em=AGORA + timedelta(seconds=10))),
        POOL,
        cast(RedisCluster, redis),
        enviador,
        AGORA,
    )

    assert redis.expiracao[_chave(destino)] == servico.TTL_MINIMO_S


def test_formatar_distancia() -> None:
    assert mensagem.formatar_distancia(350) == "350 m"
    assert mensagem.formatar_distancia(1000) == "1 km"
    assert mensagem.formatar_distancia(1234) == "1,2 km"
    assert mensagem.formatar_distancia(12345) == "12 km"


def test_montar_mensagem() -> None:
    ocorrencia = _ocorrencia(severidade=Severidade.ALTO)

    montada = mensagem.montar(ocorrencia, "token-de-teste", 350)

    assert montada["notification"]["title"] == "Alagamento · Alto"
    assert montada["notification"]["body"] == "350 m"
    assert montada["data"] == {"ocorrenciaId": str(ocorrencia.id)}
    assert montada["android"]["notification"]["channel_id"] == mensagem.CANAL_ANDROID
    assert montada["android"]["notification"]["tag"] == f"ocorrencia-{ocorrencia.id}"
