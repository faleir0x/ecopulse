"""Cliente do Firebase Cloud Messaging (API HTTP v1).

Autenticação OAuth 2.0 de conta de serviço: um JWT assinado (RS256) com a chave privada do
JSON do Firebase é trocado por um access token de 1 h, que fica em memória até perto de vencer.
A chave nunca sai do processo nem vai para o log.
"""

import asyncio
import base64
import json
import logging
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from pydantic import BaseModel, ValidationError

log = logging.getLogger(__name__)

ESCOPO = "https://www.googleapis.com/auth/firebase.messaging"
URL_ENVIO = "https://fcm.googleapis.com/v1/projects/{projeto}/messages:send"
VALIDADE_JWT_S = 3600
# Renova o access token um pouco antes de vencer
FOLGA_S = 120
TIMEOUT_S = 10.0
# Token do aparelho que não existe mais (app desinstalado, token trocado) ou de outro projeto
ERROS_DE_TOKEN = {"UNREGISTERED", "SENDER_ID_MISMATCH"}
# 400 INVALID_ARGUMENT do token malformado (os demais INVALID_ARGUMENT são de payload)
MENSAGEM_REGISTRO_INVALIDO = "registration token is not a valid"
CAMPO_REGISTRO = "message.token"


class Credenciais(BaseModel):
    """Campos usados do JSON da conta de serviço."""

    project_id: str
    client_email: str
    private_key: str
    token_uri: str = "https://oauth2.googleapis.com/token"  # noqa: S105 (URL, não segredo)


class ErroFcm(Exception):
    """Falha transitória (rede, 429, 5xx, credencial recusada): pode tentar de novo."""


class ErroPermanente(Exception):
    """Mensagem recusada (400): repetir não adianta."""


class TokenInvalido(Exception):
    """O token do aparelho não vale mais: o registro deve ser apagado."""


class Enviador(Protocol):
    async def enviar(self, mensagem: dict[str, Any]) -> None:
        """Envia uma `message` do FCM v1 (com "token")."""
        ...


def carregar_credenciais(caminho: str) -> Credenciais | None:
    """Lê o JSON da conta de serviço; None se o arquivo não existir (modo simulado)."""
    arquivo = Path(caminho)
    if not arquivo.is_file():
        return None
    try:
        return Credenciais.model_validate_json(arquivo.read_bytes())
    except ValidationError as exc:
        # Só os nomes dos campos: o conteúdo tem a chave privada
        campos = ", ".join(str(erro["loc"][0]) for erro in exc.errors() if erro["loc"])
        raise ValueError(f"credenciais do Firebase inválidas (campos: {campos})") from None


def _b64url(dados: bytes) -> str:
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode()


def assinar_jwt(credenciais: Credenciais, agora: float) -> str:
    """JWT de concessão (RFC 7523) para o endpoint de token do Google."""
    chave = serialization.load_pem_private_key(credenciais.private_key.encode(), password=None)
    if not isinstance(chave, rsa.RSAPrivateKey):
        raise ValueError("a chave da conta de serviço não é RSA")
    cabecalho = {"alg": "RS256", "typ": "JWT"}
    corpo = {
        "iss": credenciais.client_email,
        "scope": ESCOPO,
        "aud": credenciais.token_uri,
        "iat": int(agora),
        "exp": int(agora) + VALIDADE_JWT_S,
    }
    entrada = f"{_b64url(json.dumps(cabecalho).encode())}.{_b64url(json.dumps(corpo).encode())}"
    assinatura = chave.sign(entrada.encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{entrada}.{_b64url(assinatura)}"


def _erro(resposta: httpx.Response) -> dict[str, Any] | None:
    """Objeto `error` da resposta do FCM, quando existir."""
    try:
        erro = resposta.json()["error"]
    except (ValueError, KeyError, TypeError, AttributeError):
        return None
    return erro if isinstance(erro, dict) else None


def _codigo_erro(resposta: httpx.Response) -> str | None:
    """errorCode do FcmError em error.details (ex.: UNREGISTERED) ou o status genérico."""
    erro = _erro(resposta)
    if erro is None:
        return None
    detalhes = erro.get("details", [])
    for detalhe in detalhes if isinstance(detalhes, list) else []:
        if isinstance(detalhe, dict) and "errorCode" in detalhe:
            return str(detalhe["errorCode"])
    status = erro.get("status")
    return str(status) if status is not None else None


def _aponta_para_token(resposta: httpx.Response) -> bool:
    """True se o INVALID_ARGUMENT é do token do aparelho, e não do payload da mensagem."""
    erro = _erro(resposta)
    if erro is None:
        return False
    mensagem = str(erro.get("message", "")).lower()
    if MENSAGEM_REGISTRO_INVALIDO in mensagem:
        return True
    detalhes = erro.get("details", [])
    for detalhe in detalhes if isinstance(detalhes, list) else []:
        if not isinstance(detalhe, dict):
            continue
        violacoes = detalhe.get("fieldViolations", [])
        for violacao in violacoes if isinstance(violacoes, list) else []:
            if isinstance(violacao, dict) and violacao.get("field") == CAMPO_REGISTRO:
                return True
    return False


class ClienteFcm:
    def __init__(
        self,
        credenciais: Credenciais,
        cliente: httpx.AsyncClient,
        relogio: Callable[[], float] = time.time,
    ) -> None:
        self._credenciais = credenciais
        self._cliente = cliente
        self._relogio = relogio
        self._token: str | None = None
        self._vence_em = 0.0
        self._trava = asyncio.Lock()

    async def _token_acesso(self) -> str:
        async with self._trava:
            agora = self._relogio()
            if self._token is not None and agora < self._vence_em - FOLGA_S:
                return self._token
            try:
                resposta = await self._cliente.post(
                    self._credenciais.token_uri,
                    data={
                        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                        "assertion": assinar_jwt(self._credenciais, agora),
                    },
                    timeout=TIMEOUT_S,
                )
            except httpx.HTTPError as exc:
                raise ErroFcm(f"falha ao obter token do Google: {type(exc).__name__}") from exc
            if resposta.status_code != 200:
                raise ErroFcm(f"endpoint de token respondeu {resposta.status_code}")
            try:
                dados = resposta.json()
                self._token = str(dados["access_token"])
                self._vence_em = agora + float(dados.get("expires_in", VALIDADE_JWT_S))
            except (ValueError, KeyError, TypeError) as exc:
                raise ErroFcm("resposta de token inesperada") from exc
            return self._token

    async def enviar(self, mensagem: dict[str, Any]) -> None:
        token = await self._token_acesso()
        try:
            resposta = await self._cliente.post(
                URL_ENVIO.format(projeto=self._credenciais.project_id),
                json={"message": mensagem},
                headers={"Authorization": f"Bearer {token}"},
                timeout=TIMEOUT_S,
            )
        except httpx.HTTPError as exc:
            raise ErroFcm(f"falha ao chamar o FCM: {type(exc).__name__}") from exc

        if resposta.status_code == 200:
            return
        codigo = _codigo_erro(resposta)
        if resposta.status_code in (403, 404) and codigo in ERROS_DE_TOKEN:
            raise TokenInvalido(codigo)
        if (
            resposta.status_code == 400
            and codigo in (None, "INVALID_ARGUMENT")
            and _aponta_para_token(resposta)
        ):
            raise TokenInvalido(codigo or "INVALID_ARGUMENT")
        if resposta.status_code == 401:
            # Token de acesso revogado/vencido antes da hora: pede outro na próxima
            self._token = None
            raise ErroFcm("FCM recusou o access token")
        if resposta.status_code == 429 or resposta.status_code >= 500:
            raise ErroFcm(f"FCM respondeu {resposta.status_code} ({codigo})")
        raise ErroPermanente(f"FCM respondeu {resposta.status_code} ({codigo})")


class EnviadorSimulado:
    """Sem credenciais: registra no log o que seria enviado (sem o token do aparelho)."""

    def __init__(self) -> None:
        self.enviadas: list[dict[str, Any]] = []

    async def enviar(self, mensagem: dict[str, Any]) -> None:
        self.enviadas.append(mensagem)
        notificacao = mensagem.get("notification", {})
        log.info(
            "push simulado",
            extra={"titulo": notificacao.get("title"), "corpo": notificacao.get("body")},
        )
