"""Mensagens do WebSocket /v1/ws (JSON, uma por frame).

Cliente → servidor
    {"op": "subscribe", "cells": ["6gyf4b", ...]}   substitui o conjunto assinado
    {"op": "ping"}

Servidor → cliente
    {"type": "subscribed", "cells": [...]}           ordenadas, sem repetição
    {"type": "pong"}
    {"type": "ocorrencia.criada" | "ocorrencia.atualizada" | "ocorrencia.expirada",
     "ocorrencia": {OcorrenciaPayload}}
    {"type": "erro", "motivo": "<texto curto>"}       a conexão continua aberta

As células são geohash de precisão CELL_PRECISION (6). O app calcula as células que cobrem
o raio de alerta dele; o servidor só confere o formato e o limite.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from ecopulse_common import geohash
from ecopulse_common.events import OcorrenciaPayload

MAX_CELULAS_POR_CLIENTE = 50

_PREFIXO_CANAL = "ocorrencias:{"
_SUFIXO_CANAL = "}"


class Subscribe(BaseModel):
    op: Literal["subscribe"]
    cells: list[str] = Field(max_length=MAX_CELULAS_POR_CLIENTE)


class Ping(BaseModel):
    op: Literal["ping"]


Comando = Annotated[Subscribe | Ping, Field(discriminator="op")]


class Alerta(BaseModel):
    type: Literal["ocorrencia.criada", "ocorrencia.atualizada", "ocorrencia.expirada"]
    ocorrencia: OcorrenciaPayload


def canal(celula: str) -> str:
    """Canal sharded do Redis Cluster para a célula (hash tag: um slot por célula)."""
    return f"ocorrencias:{{{celula}}}"


def celula_do_canal(nome: str) -> str:
    """Inverso de `canal`. ValueError se o nome não tiver o formato."""
    if not nome.startswith(_PREFIXO_CANAL) or not nome.endswith(_SUFIXO_CANAL):
        raise ValueError(f"canal inválido: {nome!r}")
    celula = nome[len(_PREFIXO_CANAL) : -len(_SUFIXO_CANAL)]
    if not celula or "{" in celula or "}" in celula:
        raise ValueError(f"canal inválido: {nome!r}")
    return celula


def validar_celulas(celulas: list[str]) -> list[str]:
    """Ordenadas e sem repetição. ValueError se alguma não for geohash válido de precisão 6
    ou se passar de MAX_CELULAS_POR_CLIENTE (depois de remover repetições)."""
    unicas = sorted(set(celulas))
    for celula in unicas:
        if not geohash.is_valid(celula) or len(celula) != geohash.CELL_PRECISION:
            raise ValueError(f"célula inválida: {celula!r}")
    if len(unicas) > MAX_CELULAS_POR_CLIENTE:
        raise ValueError(f"máximo de {MAX_CELULAS_POR_CLIENTE} células por cliente")
    return unicas
