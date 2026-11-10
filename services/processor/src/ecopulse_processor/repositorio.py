"""Acesso ao PostGIS. Toda função recebe uma conexão já dentro de uma transação.

Tabelas em infra/postgres/init.sql. Use parâmetros posicionais ($1...), nunca f-string em SQL.
Pontos: ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography.
Para ler lat/lon: ST_Y/ST_X(geom::geometry).
"""

from datetime import timedelta
from uuid import UUID

import asyncpg

from ecopulse_common.events import (
    Envelope,
    OcorrenciaPayload,
    RelatoRecebido,
    ResolucaoRecebida,
    Severidade,
)
from ecopulse_processor import regras


def _ocorrencia_da_linha(linha: asyncpg.Record) -> OcorrenciaPayload:
    return OcorrenciaPayload(
        id=linha["id"],
        tipo=linha["tipo"],
        severidade=linha["severidade"],
        latitude=linha["latitude"],
        longitude=linha["longitude"],
        geohash=linha["geohash"],
        confirmacoes=linha["confirmacoes"],
        status=linha["status"],
        criada_em=linha["criada_em"],
        atualizada_em=linha["atualizada_em"],
        expira_em=linha["expira_em"],
        resolucoes=linha["resolucoes"],
        encerrada_em=linha["encerrada_em"],
        versao=linha["versao"],
    )


async def travar_regiao(conn: asyncpg.Connection, chave: str) -> None:
    """pg_advisory_xact_lock(hashtext(chave)): serializa o agrupamento por região até o fim
    da transação."""
    await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", chave)


async def inserir_relato(
    conn: asyncpg.Connection, relato: RelatoRecebido, geohash: str
) -> int | None:
    """INSERT ... ON CONFLICT (client_id) DO NOTHING RETURNING id.
    None se já existia (duplicata)."""
    resultado = await conn.fetchval(
        """
        INSERT INTO relatos (
            client_id, device_id, tipo, severidade, descricao, geom, geohash, registrado_em
        )
        VALUES (
            $1, $2, $3, $4, $5,
            ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography,
            $8, $9
        )
        ON CONFLICT (client_id) DO NOTHING
        RETURNING id
        """,
        relato.client_id,
        relato.device_id,
        relato.tipo.value,
        relato.severidade.value,
        relato.descricao,
        relato.latitude,
        relato.longitude,
        geohash,
        relato.registrado_em,
    )
    return int(resultado) if resultado is not None else None


async def ocorrencia_proxima(
    conn: asyncpg.Connection, relato: RelatoRecebido, raio_m: int
) -> int | None:
    """Id da ocorrência ATIVA e não expirada (expira_em > now()) do mesmo tipo mais próxima
    dentro de raio_m (ST_DWithin), com SELECT ... FOR UPDATE. None se não houver."""
    resultado = await conn.fetchval(
        """
        SELECT id
        FROM ocorrencias
        WHERE tipo = $1
          AND status = 'ativa'
          AND expira_em > now()
          AND ST_DWithin(
              geom,
              ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
              $4::double precision
          )
        ORDER BY ST_Distance(
            geom, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
        )
        LIMIT 1
        FOR UPDATE
        """,
        relato.tipo.value,
        relato.latitude,
        relato.longitude,
        raio_m,
    )
    return int(resultado) if resultado is not None else None


async def criar_ocorrencia(
    conn: asyncpg.Connection, relato: RelatoRecebido, geohash: str, validade: timedelta
) -> OcorrenciaPayload:
    """Cria a ocorrência na posição do relato, confirmacoes=1, expira_em = now() + validade."""
    linha = await conn.fetchrow(
        """
        INSERT INTO ocorrencias (tipo, severidade, geom, geohash, confirmacoes, expira_em)
        VALUES (
            $1, $2,
            ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
            $5, 1, now() + $6::interval
        )
        RETURNING
            id, tipo, severidade,
            ST_Y(geom::geometry) AS latitude,
            ST_X(geom::geometry) AS longitude,
            geohash, confirmacoes, status, criada_em, atualizada_em, expira_em,
            resolucoes, encerrada_em, versao
        """,
        relato.tipo.value,
        relato.severidade.value,
        relato.latitude,
        relato.longitude,
        geohash,
        validade,
    )
    if linha is None:
        raise RuntimeError("INSERT de ocorrência não retornou linha")
    return _ocorrencia_da_linha(linha)


async def confirmar_ocorrencia(
    conn: asyncpg.Connection,
    ocorrencia_id: int,
    severidade: Severidade,
    validade: timedelta,
) -> OcorrenciaPayload:
    """confirmacoes + 1; severidade = a maior entre a atual e a nova (regras.ORDEM_SEVERIDADE);
    atualizada_em = now(); expira_em = now() + validade. Retorna o estado novo."""
    linha = await conn.fetchrow(
        """
        UPDATE ocorrencias
        SET confirmacoes = confirmacoes + 1,
            versao = versao + 1,
            severidade = CASE
                WHEN array_position($3::text[], severidade)
                     >= array_position($3::text[], $2::text)
                THEN severidade
                ELSE $2::text
            END,
            atualizada_em = now(),
            expira_em = now() + $4::interval
        WHERE id = $1
        RETURNING
            id, tipo, severidade,
            ST_Y(geom::geometry) AS latitude,
            ST_X(geom::geometry) AS longitude,
            geohash, confirmacoes, status, criada_em, atualizada_em, expira_em,
            resolucoes, encerrada_em, versao
        """,
        ocorrencia_id,
        severidade.value,
        [item.value for item in regras.ORDEM_SEVERIDADE],
        validade,
    )
    if linha is None:
        raise RuntimeError("UPDATE de ocorrência não retornou linha")
    return _ocorrencia_da_linha(linha)


async def aparelho_ja_contribuiu(
    conn: asyncpg.Connection, ocorrencia_id: int, device_id: UUID, relato_id: int
) -> bool:
    """True se o aparelho já tem OUTRO relato (id <> relato_id) vinculado à ocorrência."""
    resultado = await conn.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM relatos
            WHERE ocorrencia_id = $1
              AND device_id = $2
              AND id <> $3
        )
        """,
        ocorrencia_id,
        device_id,
        relato_id,
    )
    return bool(resultado)


async def elevar_severidade(
    conn: asyncpg.Connection, ocorrencia_id: int, severidade: Severidade
) -> OcorrenciaPayload | None:
    """Sobe a severidade para `severidade` se ela for maior que a atual
    (regras.ORDEM_SEVERIDADE), com atualizada_em = now(); NÃO mexe em confirmacoes nem em
    expira_em. Retorna o estado novo, ou None se a severidade não mudou."""
    linha = await conn.fetchrow(
        """
        UPDATE ocorrencias
        SET severidade = $2::text,
            versao = versao + 1,
            atualizada_em = now()
        WHERE id = $1
          AND array_position($3::text[], severidade)
              < array_position($3::text[], $2::text)
        RETURNING
            id, tipo, severidade,
            ST_Y(geom::geometry) AS latitude,
            ST_X(geom::geometry) AS longitude,
            geohash, confirmacoes, status, criada_em, atualizada_em, expira_em,
            resolucoes, encerrada_em, versao
        """,
        ocorrencia_id,
        severidade.value,
        [item.value for item in regras.ORDEM_SEVERIDADE],
    )
    return _ocorrencia_da_linha(linha) if linha is not None else None


async def vincular_relato(conn: asyncpg.Connection, relato_id: int, ocorrencia_id: int) -> None:
    await conn.execute(
        "UPDATE relatos SET ocorrencia_id = $2 WHERE id = $1",
        relato_id,
        ocorrencia_id,
    )


async def travar_ocorrencia(
    conn: asyncpg.Connection, ocorrencia_id: int
) -> OcorrenciaPayload | None:
    """SELECT ... FOR UPDATE da ocorrência (qualquer status). None se não existe."""
    linha = await conn.fetchrow(
        """
        SELECT
            id, tipo, severidade,
            ST_Y(geom::geometry) AS latitude,
            ST_X(geom::geometry) AS longitude,
            geohash, confirmacoes, status, criada_em, atualizada_em, expira_em,
            resolucoes, encerrada_em, versao
        FROM ocorrencias
        WHERE id = $1
        FOR UPDATE
        """,
        ocorrencia_id,
    )
    return _ocorrencia_da_linha(linha) if linha is not None else None


async def inserir_resolucao(conn: asyncpg.Connection, resolucao: ResolucaoRecebida) -> int | None:
    """INSERT ... ON CONFLICT DO NOTHING RETURNING id. None cobre client_id repetido e o
    mesmo aparelho votando de novo na mesma ocorrência."""
    resultado = await conn.fetchval(
        """
        INSERT INTO resolucoes (client_id, device_id, ocorrencia_id, registrado_em)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
        RETURNING id
        """,
        resolucao.client_id,
        resolucao.device_id,
        resolucao.ocorrencia_id,
        resolucao.registrado_em,
    )
    return int(resultado) if resultado is not None else None


async def registrar_resolucao(
    conn: asyncpg.Connection, ocorrencia_id: int, *, encerrar: bool
) -> OcorrenciaPayload:
    """resolucoes + 1 e atualizada_em = now(); se encerrar, também status='expirada',
    encerrada_em = now() e expira_em = now(). Retorna o estado novo."""
    linha = await conn.fetchrow(
        """
        UPDATE ocorrencias
        SET resolucoes = resolucoes + 1,
            versao = versao + 1,
            atualizada_em = now(),
            status = CASE WHEN $2 THEN 'expirada' ELSE status END,
            encerrada_em = CASE WHEN $2 THEN now() ELSE encerrada_em END,
            expira_em = CASE WHEN $2 THEN now() ELSE expira_em END
        WHERE id = $1
        RETURNING
            id, tipo, severidade,
            ST_Y(geom::geometry) AS latitude,
            ST_X(geom::geometry) AS longitude,
            geohash, confirmacoes, status, criada_em, atualizada_em, expira_em,
            resolucoes, encerrada_em, versao
        """,
        ocorrencia_id,
        encerrar,
    )
    if linha is None:
        raise RuntimeError("UPDATE de resolução não retornou linha")
    return _ocorrencia_da_linha(linha)


async def enfileirar_evento(conn: asyncpg.Connection, envelope: Envelope) -> None:
    """INSERT na outbox: event_id, routing_key = envelope.type,
    envelope = model_dump(mode='json')."""
    await conn.execute(
        "INSERT INTO outbox (event_id, routing_key, envelope) VALUES ($1, $2, $3)",
        envelope.event_id,
        str(envelope.type),
        envelope.model_dump_json(),
    )


async def expirar_vencidas(conn: asyncpg.Connection) -> list[OcorrenciaPayload]:
    """UPDATE status='expirada', atualizada_em=now(), encerrada_em=expira_em
    WHERE status='ativa' AND expira_em <= now() RETURNING o estado novo de cada uma."""
    linhas = await conn.fetch(
        """
        UPDATE ocorrencias
        SET status = 'expirada', versao = versao + 1, atualizada_em = now(),
            encerrada_em = expira_em
        WHERE status = 'ativa' AND expira_em <= now()
        RETURNING
            id, tipo, severidade,
            ST_Y(geom::geometry) AS latitude,
            ST_X(geom::geometry) AS longitude,
            geohash, confirmacoes, status, criada_em, atualizada_em, expira_em,
            resolucoes, encerrada_em, versao
        """
    )
    return [_ocorrencia_da_linha(linha) for linha in linhas]
