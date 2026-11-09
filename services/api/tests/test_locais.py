from typing import Any, cast

import httpx
import pytest
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster

from ecopulse_api import locais, main, rotas
from ecopulse_common.config import Settings


class RedisFalso:
    def __init__(self) -> None:
        self.dados: dict[str, bytes] = {}

    async def get(self, chave: str) -> bytes | None:
        return self.dados.get(chave)

    async def set(self, chave: str, valor: bytes, ex: int | None = None) -> bool:
        del ex
        self.dados[chave] = valor
        return True

    async def eval(self, *_: Any) -> list[Any]:
        return [1, "0"]


def _feature(nome: str, rotulo: str, lon: float, lat: float) -> dict[str, Any]:
    return {
        "properties": {"name": nome, "label": rotulo},
        "geometry": {"coordinates": [lon, lat]},
    }


RESPOSTA_ORS = {
    "features": [
        _feature("Pinheiros", "Pinheiros, São Paulo, Brazil", -46.70, -23.56),
        _feature("Pinheiros", "Pinheiros, São Paulo, Brazil", -46.70, -23.56),
        _feature("Pinheiros", "Pinheiros, RS, Brazil", -52.74, -29.79),
        {"properties": {}, "geometry": {}},
    ]
}


def test_detalhe_tira_nome_e_pais() -> None:
    assert locais._detalhe("Pinheiros", "Pinheiros, São Paulo, Brazil") == "São Paulo"
    assert locais._detalhe("Brasília", "Brasília, Brazil") is None
    assert locais._detalhe("Rua Augusta, 304", "Rua Augusta, 304, São Paulo, Brazil") == "São Paulo"


def test_parse_poe_bairro_antes_de_estabelecimento() -> None:
    dados = {
        "features": [
            {
                **_feature("Padaria Bela Vista", "Padaria Bela Vista, São Paulo, Brazil", 0, 0),
                "properties": {"name": "Padaria Bela Vista", "label": "x", "layer": "venue"},
            },
            {
                **_feature("Bela Vista", "Bela Vista, São Paulo, Brazil", 0, 0),
                "properties": {
                    "name": "Bela Vista",
                    "label": "Bela Vista, São Paulo, Brazil",
                    "layer": "neighbourhood",
                },
            },
        ]
    }

    assert [r.nome for r in locais._parse(dados)] == ["Bela Vista", "Padaria Bela Vista"]


def test_parse_poe_nome_exato_primeiro() -> None:
    dados = {
        "features": [
            _feature("Esporte Clube Pinheiros", "Esporte Clube Pinheiros, São Paulo, Brazil", 0, 0),
            _feature("Pinheiros", "Pinheiros, São Paulo, Brazil", 0, 0),
        ]
    }

    assert locais._parse(dados, "pinheiros")[0].nome == "Pinheiros"


def test_parse_poe_cidade_digitada_antes_da_proxima() -> None:
    # Com foco em Ribeirão Preto o ORS devolve primeiro as avenidas de lá
    dados = {
        "features": [
            _feature(
                "Avenida Leais Paulista", "Avenida Leais Paulista, Ribeirao Preto, SP, Brazil", 0, 0
            ),
            _feature("Avenida Paulista", "Avenida Paulista, Guariba, SP, Brazil", 0, 0),
            _feature("Avenida Paulista", "Avenida Paulista, São Paulo, Brazil", 0, 0),
        ]
    }

    resultado = locais._parse(dados, "Avenida Paulista Sao Paulo")
    assert resultado[0].detalhe == "São Paulo"


def test_cobertura_aceita_ultima_palavra_pela_metade() -> None:
    assert locais.cobertura("avenida paul", "Avenida Paulista, São Paulo, Brazil") == 1.0
    assert locais.cobertura("paulista são paulo", "Avenida Paulista, Guariba, SP") < 1.0
    assert locais.cobertura("", "qualquer") == 1.0


def test_chave_do_cache_separa_regioes() -> None:
    assert locais.chave_cache("Bela Vista", (-23.55, -46.64)) != locais.chave_cache("Bela Vista")
    assert locais.chave_cache("bela  vista", (-23.531, -46.641)) == locais.chave_cache(
        "Bela Vista", (-23.539, -46.639)
    )


def test_parse_descarta_repetidos_e_invalidos() -> None:
    resultado = locais._parse(RESPOSTA_ORS)

    assert [(r.nome, r.detalhe) for r in resultado] == [
        ("Pinheiros", "São Paulo"),
        ("Pinheiros", "RS"),
    ]
    assert resultado[0].latitude == pytest.approx(-23.56)


async def test_busca_usa_cache_na_segunda_vez() -> None:
    chamadas: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        chamadas.append(request)
        return httpx.Response(200, json=RESPOSTA_ORS)

    redis = RedisFalso()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        for texto in ("Pinheiros", "  pinheiros "):
            resultado = await locais.buscar(
                cast(RedisCluster, redis), cliente, texto, chave="k", base_url="https://ors.test"
            )
            assert len(resultado) == 2

    assert len(chamadas) == 1
    assert chamadas[0].url.params["boundary.country"] == "BR"
    assert chamadas[0].headers["Authorization"] == "k"


async def test_ors_fora_levanta_indisponivel() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(502)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        with pytest.raises(locais.BuscaIndisponivel):
            await locais.buscar(
                cast(RedisCluster, RedisFalso()),
                cliente,
                "Pinheiros",
                chave="k",
                base_url="https://ors.test",
            )


def test_endpoint_exige_tres_letras() -> None:
    main.app.state.redis = RedisFalso()
    resposta = TestClient(main.app).get("/v1/locais", params={"q": "ab"})

    assert resposta.status_code == 422


def test_endpoint_sem_chave_retorna_503() -> None:
    main.app.state.redis = RedisFalso()
    main.app.dependency_overrides[rotas.obter_settings] = lambda: Settings(ors_api_key="")
    try:
        resposta = TestClient(main.app).get("/v1/locais", params={"q": "Pinheiros"})
    finally:
        main.app.dependency_overrides.pop(rotas.obter_settings, None)

    assert resposta.status_code == 503
