import base64
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from ecopulse_notifier import fcm


def _credenciais() -> tuple[fcm.Credenciais, rsa.RSAPrivateKey]:
    chave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = chave.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    credenciais = fcm.Credenciais(
        project_id="projeto-teste",
        client_email="servico@projeto-teste.iam.gserviceaccount.com",
        private_key=pem,
    )
    return credenciais, chave


class Relogio:
    def __init__(self, agora: float) -> None:
        self.agora = agora

    def __call__(self) -> float:
        return self.agora


def _decodificar(parte: str) -> bytes:
    return base64.urlsafe_b64decode(parte + "=" * (-len(parte) % 4))


def _mensagem() -> dict[str, Any]:
    return {"token": "token-do-aparelho", "notification": {"title": "t", "body": "b"}}


def _resposta_de_erro(status: int, codigo: str | None = None) -> httpx.Response:
    detalhes = (
        [{"@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", "errorCode": codigo}]
        if codigo is not None
        else []
    )
    return httpx.Response(status, json={"error": {"status": "ERRO", "details": detalhes}})


def _resposta_invalid_argument(*, mensagem: str, campo: str | None = None) -> httpx.Response:
    detalhes: list[dict[str, Any]] = [
        {
            "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
            "errorCode": "INVALID_ARGUMENT",
        }
    ]
    if campo is not None:
        detalhes.append(
            {
                "@type": "type.googleapis.com/google.rpc.BadRequest",
                "fieldViolations": [{"field": campo, "description": mensagem}],
            }
        )
    return httpx.Response(
        400,
        json={"error": {"status": "INVALID_ARGUMENT", "message": mensagem, "details": detalhes}},
    )


def _handler_token(
    credenciais: fcm.Credenciais, pedidos: list[httpx.Request], resposta: httpx.Response
) -> Any:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == credenciais.token_uri:
            pedidos.append(request)
            return httpx.Response(
                200, json={"access_token": f"token-{len(pedidos)}", "expires_in": 3600}
            )
        return resposta

    return handler


def test_assinar_jwt_tem_tres_partes_e_assinatura_confere() -> None:
    credenciais, chave = _credenciais()

    jwt = fcm.assinar_jwt(credenciais, 1_700_000_000.0)

    cabecalho, corpo, assinatura = jwt.split(".")
    assert json.loads(_decodificar(cabecalho)) == {"alg": "RS256", "typ": "JWT"}
    dados = json.loads(_decodificar(corpo))
    assert dados["iss"] == credenciais.client_email
    assert dados["aud"] == credenciais.token_uri
    assert dados["scope"] == fcm.ESCOPO
    assert dados["exp"] - dados["iat"] == fcm.VALIDADE_JWT_S

    chave.public_key().verify(
        _decodificar(assinatura),
        f"{cabecalho}.{corpo}".encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )


async def test_access_token_reaproveitado_ate_perto_de_vencer() -> None:
    credenciais, _ = _credenciais()
    relogio = Relogio(1_700_000_000.0)
    pedidos: list[httpx.Request] = []
    envios: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == credenciais.token_uri:
            pedidos.append(request)
            return httpx.Response(
                200, json={"access_token": f"token-{len(pedidos)}", "expires_in": 3600}
            )
        envios.append(request)
        return httpx.Response(200, json={})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        fcm_cliente = fcm.ClienteFcm(credenciais, cliente, relogio)
        mensagem = _mensagem()

        await fcm_cliente.enviar(mensagem)
        assert len(pedidos) == 1

        relogio.agora += 1_000  # ainda bem antes de vencer
        await fcm_cliente.enviar(mensagem)
        assert len(pedidos) == 1

        relogio.agora += fcm.VALIDADE_JWT_S
        await fcm_cliente.enviar(mensagem)
        assert len(pedidos) == 2

    assert str(envios[0].url) == fcm.URL_ENVIO.format(projeto=credenciais.project_id)
    assert envios[0].headers["Authorization"] == "Bearer token-1"
    assert envios[-1].headers["Authorization"] == "Bearer token-2"


async def test_404_unregistered_vira_token_invalido() -> None:
    credenciais, _ = _credenciais()
    pedidos: list[httpx.Request] = []
    handler = _handler_token(credenciais, pedidos, _resposta_de_erro(404, "UNREGISTERED"))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        with pytest.raises(fcm.TokenInvalido):
            await fcm.ClienteFcm(credenciais, cliente).enviar(_mensagem())


async def test_400_vira_erro_permanente() -> None:
    credenciais, _ = _credenciais()
    pedidos: list[httpx.Request] = []
    handler = _handler_token(credenciais, pedidos, _resposta_de_erro(400))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        with pytest.raises(fcm.ErroPermanente):
            await fcm.ClienteFcm(credenciais, cliente).enviar(_mensagem())


async def test_400_invalid_argument_de_token_vira_token_invalido() -> None:
    credenciais, _ = _credenciais()
    pedidos: list[httpx.Request] = []
    resposta = _resposta_invalid_argument(
        mensagem="The registration token is not a valid FCM registration token"
    )
    handler = _handler_token(credenciais, pedidos, resposta)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        with pytest.raises(fcm.TokenInvalido):
            await fcm.ClienteFcm(credenciais, cliente).enviar(_mensagem())


async def test_400_invalid_argument_no_campo_message_token_vira_token_invalido() -> None:
    credenciais, _ = _credenciais()
    pedidos: list[httpx.Request] = []
    resposta = _resposta_invalid_argument(
        mensagem="Invalid value at 'message.token'", campo="message.token"
    )
    handler = _handler_token(credenciais, pedidos, resposta)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        with pytest.raises(fcm.TokenInvalido):
            await fcm.ClienteFcm(credenciais, cliente).enviar(_mensagem())


async def test_400_invalid_argument_de_payload_vira_erro_permanente() -> None:
    credenciais, _ = _credenciais()
    pedidos: list[httpx.Request] = []
    resposta = _resposta_invalid_argument(
        mensagem="Invalid JSON payload received", campo="message.data"
    )
    handler = _handler_token(credenciais, pedidos, resposta)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        with pytest.raises(fcm.ErroPermanente):
            await fcm.ClienteFcm(credenciais, cliente).enviar(_mensagem())


async def test_503_vira_erro_transitorio() -> None:
    credenciais, _ = _credenciais()
    pedidos: list[httpx.Request] = []
    handler = _handler_token(credenciais, pedidos, _resposta_de_erro(503))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        with pytest.raises(fcm.ErroFcm):
            await fcm.ClienteFcm(credenciais, cliente).enviar(_mensagem())


async def test_401_vira_erro_e_proximo_envio_pede_novo_token() -> None:
    credenciais, _ = _credenciais()
    pedidos: list[httpx.Request] = []
    envios = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal envios
        if str(request.url) == credenciais.token_uri:
            pedidos.append(request)
            return httpx.Response(
                200, json={"access_token": f"token-{len(pedidos)}", "expires_in": 3600}
            )
        envios += 1
        if envios == 1:
            return _resposta_de_erro(401)
        return httpx.Response(200, json={})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        fcm_cliente = fcm.ClienteFcm(credenciais, cliente)
        with pytest.raises(fcm.ErroFcm):
            await fcm_cliente.enviar(_mensagem())
        assert len(pedidos) == 1

        await fcm_cliente.enviar(_mensagem())
        assert len(pedidos) == 2


def test_carregar_credenciais_sem_arquivo(tmp_path: Path) -> None:
    assert fcm.carregar_credenciais(str(tmp_path / "nao-existe.json")) is None


def test_carregar_credenciais_json_invalido_nao_vaza_conteudo(tmp_path: Path) -> None:
    segredo = "SEGREDO-QUE-NAO-PODE-VAZAR"
    caminho = tmp_path / "firebase.json"
    caminho.write_text('{"private_key": "' + segredo)

    with pytest.raises(ValueError) as erro:
        fcm.carregar_credenciais(str(caminho))

    assert segredo not in str(erro.value)
