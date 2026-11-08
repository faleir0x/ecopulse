import ipaddress
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

import asyncpg
import httpx
from aio_pika.abc import AbstractRobustConnection
from aio_pika.exceptions import AMQPError
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import RedisError

from ecopulse_api import invalidacao, leitura, limite, rotas
from ecopulse_api.schemas import (
    CelulaAmbiente,
    ConfirmacaoIn,
    ModoRota,
    OcorrenciaDetalhe,
    RelatoAceito,
    RelatoIn,
    ResolucaoIn,
    RotaSegura,
    SituacaoRelato,
)
from ecopulse_common import geohash, messaging
from ecopulse_common.ambiente import registrar_interesse
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_common.db import create_pool
from ecopulse_common.events import (
    Envelope,
    EventType,
    LeituraAmbiente,
    OcorrenciaPayload,
    RelatoRecebido,
    ResolucaoRecebida,
    StatusOcorrencia,
    TipoRisco,
)
from ecopulse_common.logs import configure_logging
from ecopulse_common.messaging import Topology

log = logging.getLogger(__name__)


@dataclass
class Broker:
    connection: AbstractRobustConnection
    topology: Topology


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = Settings()
    configure_logging("api", settings.log_level)
    connection = await messaging.connect(settings.rabbit_url)
    # on_return_raises: relato sem fila de destino vira erro (503), não some em silêncio
    channel = await connection.channel(publisher_confirms=True, on_return_raises=True)
    topology = await messaging.declare_topology(channel, settings.partitions)
    pool = await create_pool(settings.database_url)
    redis = create_cluster(settings)
    await invalidacao.iniciar(await connection.channel(), topology.events, redis)
    app.state.broker = Broker(connection, topology)
    app.state.pool = pool
    app.state.redis = redis
    app.state.proxies = frozenset(
        ip.strip() for ip in settings.proxies_confiaveis.split(",") if ip.strip()
    )
    yield
    await connection.close()
    await redis.aclose()
    await pool.close()


app = FastAPI(title="EcoPulse API", version="0.1.0", lifespan=lifespan)


def _broker(request: Request) -> Broker:
    broker: Broker = request.app.state.broker
    return broker


def _pool(request: Request) -> asyncpg.Pool:
    pool: asyncpg.Pool = request.app.state.pool
    return pool


def _redis(request: Request) -> RedisCluster:
    redis: RedisCluster = request.app.state.redis
    return redis


def _exigir_limite(resultado: limite.Resultado, mensagem: str, contexto: dict[str, str]) -> None:
    """429 com Retry-After quando o token bucket não liberou."""
    if not resultado.permitido:
        log.warning("rate limit excedido", extra=contexto)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            mensagem,
            headers={"Retry-After": str(resultado.retry_after_s)},
        )


def _ip_cliente(request: Request) -> str:
    """IP de origem. CF-Connecting-IP só vale quando a conexão vem de um proxy confiável (o
    túnel da Cloudflare); de qualquer outro lugar é ignorado, então não dá para forjar o IP."""
    direto = request.client.host if request.client is not None else "desconhecido"
    proxies: frozenset[str] = getattr(request.app.state, "proxies", frozenset())
    if direto in proxies:
        cabecalho = request.headers.get("cf-connecting-ip", "").strip()
        try:
            return str(ipaddress.ip_address(cabecalho))
        except ValueError:
            pass
    return direto


async def _aplicar_limite(request: Request, device_id: UUID) -> None:
    """Limita pelo aparelho e pelo IP de origem (ver _ip_cliente; X-Forwarded-For é ignorado)."""
    resultado_aparelho = await limite.consumir(_redis(request), device_id)
    _exigir_limite(
        resultado_aparelho,
        "muitos relatos deste aparelho",
        {"device_id": str(device_id)},
    )
    ip = _ip_cliente(request)
    resultado_ip = await limite.consumir_ip(_redis(request), ip)
    _exigir_limite(resultado_ip, "muitos relatos deste IP", {"ip": ip})


async def _publicar_evento(
    request: Request,
    envelope: Envelope,
    *,
    falha: str,
    aceito: str,
    contexto: dict[str, str],
) -> None:
    """Publica no exchange de eventos. Broker fora → 503 (o app mantém na outbox e tenta)."""
    try:
        await messaging.publish(_broker(request).topology.events, envelope)
    except (AMQPError, ConnectionError) as exc:
        log.error(falha, extra=contexto)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "broker indisponível",
            headers={"Retry-After": "5"},
        ) from exc
    log.info(aceito, extra=contexto)


async def _publicar_relato(request: Request, relato: RelatoRecebido) -> None:
    """Publica `relato.recebido`. O event_id é o próprio client_id: um reenvio do app gera a
    mesma mensagem lógica. Broker fora → 503 (o app mantém na outbox e tenta de novo)."""
    envelope = Envelope(
        event_id=relato.client_id,
        type=EventType.RELATO_RECEBIDO,
        geohash=geohash.encode(relato.latitude, relato.longitude, geohash.CELL_PRECISION),
        payload=relato.model_dump(mode="json"),
    )
    await _publicar_evento(
        request,
        envelope,
        falha="falha ao publicar relato",
        aceito="relato aceito",
        contexto={"client_id": str(relato.client_id)},
    )


async def _publicar_resolucao(
    request: Request, ocorrencia: OcorrenciaPayload, resolucao: ResolucaoRecebida
) -> None:
    """Publica `resolucao.recebida` na mesma partição dos relatos da área da ocorrência."""
    envelope = Envelope(
        event_id=resolucao.client_id,
        type=EventType.RESOLUCAO_RECEBIDA,
        geohash=geohash.encode(ocorrencia.latitude, ocorrencia.longitude, geohash.CELL_PRECISION),
        payload=resolucao.model_dump(mode="json"),
    )
    await _publicar_evento(
        request,
        envelope,
        falha="falha ao publicar resolução",
        aceito="resolução aceita",
        contexto={"client_id": str(resolucao.client_id)},
    )


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness: o processo está de pé."""
    return {"status": "ok"}


@app.get("/ready")
async def ready(request: Request) -> dict[str, str]:
    """Readiness: conectado ao broker."""
    if _broker(request).connection.is_closed:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "broker indisponível")
    return {"status": "ok"}


@app.post("/v1/relatos", status_code=status.HTTP_202_ACCEPTED)
async def criar_relato(relato: RelatoIn, request: Request) -> RelatoAceito:
    """Aceita o relato e publica `relato.recebido`. Só responde 202 após o confirm do broker."""
    await _aplicar_limite(request, relato.device_id)
    await _publicar_relato(request, RelatoRecebido(**relato.model_dump()))
    return RelatoAceito(client_id=relato.client_id)


@app.get("/v1/relatos/{client_id}")
async def situacao_relato(client_id: UUID, request: Request) -> SituacaoRelato:
    """Em qual ocorrência o próprio relato entrou. 404 "processando" até o processor gravar."""
    situacao = await leitura.buscar_situacao_relato(_pool(request), client_id)
    if situacao is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "processando")
    return situacao


@app.get("/v1/ocorrencias")
async def listar_ocorrencias(
    request: Request,
    bbox: Annotated[str, Query(description="min_lon,min_lat,max_lon,max_lat")],
    tipo: TipoRisco | None = None,
) -> list[OcorrenciaPayload]:
    """Ocorrências ativas no retângulo visível do mapa (cache por célula geohash5)."""
    try:
        min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
        celulas = leitura.celulas_do_bbox(min_lon, min_lat, max_lon, max_lat)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"bbox inválido: {exc}") from exc
    ocorrencias = await leitura.ocorrencias_por_celulas(_pool(request), _redis(request), celulas)
    return leitura.filtrar(ocorrencias, min_lon, min_lat, max_lon, max_lat, tipo)


@app.get("/v1/ambiente/camada")
async def ler_camada(
    request: Request,
    bbox: Annotated[str, Query(description="min_lon,min_lat,max_lon,max_lat")],
) -> list[CelulaAmbiente]:
    """Última leitura de cada célula geohash5 do retângulo visível do mapa. Registra interesse
    em todas as células (o environment coleta as que faltam em até 30 s) e devolve só as que
    já têm leitura."""
    try:
        min_lon, min_lat, max_lon, max_lat = (float(valor) for valor in bbox.split(","))
        celulas = leitura.celulas_do_bbox(min_lon, min_lat, max_lon, max_lat)
    except ValueError as exc:
        detalhe = "aproxime o mapa" if "acima do máximo" in str(exc) else f"bbox inválido: {exc}"
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detalhe) from exc

    agora = time.time()
    for celula in celulas:
        try:
            await registrar_interesse(_redis(request), celula, agora)
        except RedisError:
            log.warning("falha ao registrar interesse da camada")
            break

    return await leitura.leituras_das_celulas(_pool(request), _redis(request), celulas)


@app.get("/v1/ambiente")
async def ler_ambiente(
    request: Request,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
) -> LeituraAmbiente:
    """Última leitura ambiental da célula geohash5 do ponto (cache-aside no Redis)."""
    geohash5 = geohash.encode(lat, lon, geohash.PARTITION_PRECISION)
    try:
        await registrar_interesse(_redis(request), geohash5, time.time())
    except RedisError:
        log.warning("falha ao registrar interesse de célula", extra={"geohash": geohash5})

    resultado = await leitura.ultima_leitura(_pool(request), _redis(request), geohash5)
    if resultado is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "sem leitura")
    return resultado


@app.get("/v1/rotas")
async def calcular_rota(
    request: Request,
    origem: Annotated[str, Query(description="lat,lon")],
    destino: Annotated[str, Query(description="lat,lon")],
    cliente_ors: Annotated[httpx.AsyncClient, Depends(rotas.obter_cliente_ors)],
    settings: Annotated[Settings, Depends(rotas.obter_settings)],
    modo: Annotated[ModoRota, Query()] = "pedestre",
) -> RotaSegura:
    """Rota de A até B desviando das ocorrências ativas, comparada com a rota direta."""
    try:
        origem_coordenada = rotas.parse_coordenada(origem)
        destino_coordenada = rotas.parse_coordenada(destino)
        rotas.validar_distancia(origem_coordenada, destino_coordenada)
        if not settings.ors_api_key:
            raise rotas.OrsNaoConfigurado
        ip = _ip_cliente(request)
        _exigir_limite(
            await limite.consumir_rota(_redis(request), ip), "muitas rotas deste IP", {"ip": ip}
        )
        return await rotas.rota_segura(
            _pool(request),
            _redis(request),
            cliente_ors,
            origem_coordenada,
            destino_coordenada,
            modo,
            chave=settings.ors_api_key,
            base_url=settings.ors_url,
        )
    except rotas.CoordenadaInvalida as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except rotas.DistanciaGrandeDemais as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "distância grande demais"
        ) from exc
    except rotas.OrsNaoConfigurado as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "rotas indisponíveis") from exc
    except rotas.OrsIndisponivel as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "rotas indisponíveis",
            headers={"Retry-After": "30"},
        ) from exc


@app.get("/v1/ocorrencias/{ocorrencia_id}")
async def detalhar_ocorrencia(ocorrencia_id: int, request: Request) -> OcorrenciaDetalhe:
    ocorrencia = await leitura.detalhar_ocorrencia(_pool(request), ocorrencia_id)
    if ocorrencia is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ocorrência não encontrada")
    return ocorrencia


@app.post("/v1/ocorrencias/{ocorrencia_id}/confirmacoes", status_code=status.HTTP_202_ACCEPTED)
async def confirmar_ocorrencia(
    ocorrencia_id: int, confirmacao: ConfirmacaoIn, request: Request
) -> RelatoAceito:
    """Confirmar = relatar o mesmo tipo e severidade no local da ocorrência; o processor
    agrupa e incrementa as confirmações. 409 se a ocorrência já expirou."""
    ocorrencia = await leitura.buscar_ocorrencia(_pool(request), ocorrencia_id)
    if ocorrencia is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ocorrência não encontrada")
    if ocorrencia.status is StatusOcorrencia.EXPIRADA:
        raise HTTPException(status.HTTP_409_CONFLICT, "ocorrência expirada")
    await _aplicar_limite(request, confirmacao.device_id)
    relato = RelatoRecebido(
        client_id=confirmacao.client_id,
        device_id=confirmacao.device_id,
        tipo=ocorrencia.tipo,
        severidade=ocorrencia.severidade,
        latitude=ocorrencia.latitude,
        longitude=ocorrencia.longitude,
        registrado_em=confirmacao.registrado_em,
    )
    await _publicar_relato(request, relato)
    return RelatoAceito(client_id=confirmacao.client_id)


@app.post("/v1/ocorrencias/{ocorrencia_id}/resolucoes", status_code=status.HTTP_202_ACCEPTED)
async def resolver_ocorrencia(
    ocorrencia_id: int, resolucao: ResolucaoIn, request: Request
) -> RelatoAceito:
    """Marca a ocorrência como "já passou". Cada aparelho conta uma vez; o processor encerra
    quando as marcações chegam a min(3, confirmações). 409 se a ocorrência já não está ativa."""
    ocorrencia = await leitura.buscar_ocorrencia(_pool(request), ocorrencia_id)
    if ocorrencia is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ocorrência não encontrada")
    if ocorrencia.status is not StatusOcorrencia.ATIVA:
        raise HTTPException(status.HTTP_409_CONFLICT, "ocorrência encerrada")
    await _aplicar_limite(request, resolucao.device_id)
    await _publicar_resolucao(
        request,
        ocorrencia,
        ResolucaoRecebida(
            client_id=resolucao.client_id,
            device_id=resolucao.device_id,
            ocorrencia_id=ocorrencia_id,
            registrado_em=resolucao.registrado_em,
        ),
    )
    return RelatoAceito(client_id=resolucao.client_id)
