"""Gera os tipos TypeScript do contrato da API a partir do OpenAPI do FastAPI.

Uso:
    uv run python -m ecopulse_api.contrato > mobile/src/api/contrato.gerado.ts
"""

import re
from typing import Any

from ecopulse_api.main import app

CABECALHO = """\
// Arquivo gerado a partir do OpenAPI da API. NÃO EDITE À MÃO.
// Regenerar: uv run python -m ecopulse_api.contrato > mobile/src/api/contrato.gerado.ts
"""

_IDENTIFICADOR = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")
_CARACTERE_INVALIDO = re.compile(r"[^A-Za-z0-9_$]")


def _nome(nome: str) -> str:
    """Nome de schema/referência válido como identificador TypeScript."""
    normalizado = _CARACTERE_INVALIDO.sub("_", nome)
    if not normalizado or normalizado[0].isdigit():
        normalizado = f"_{normalizado}"
    return normalizado


def _campo(nome: str) -> str:
    return nome if _IDENTIFICADOR.match(nome) else f"'{nome}'"


def _literal(valor: Any) -> str:
    if valor is True:
        return "true"
    if valor is False:
        return "false"
    if valor is None:
        return "null"
    if isinstance(valor, str):
        escapado = valor.replace("\\", "\\\\").replace("'", "\\'")
        return f"'{escapado}'"
    return str(valor)


def _uniao(partes: list[dict[str, Any]]) -> str:
    tipos: list[str] = []
    for parte in partes:
        tipo = _tipo(parte)
        if tipo not in tipos:
            tipos.append(tipo)
    if "null" in tipos:
        tipos = [tipo for tipo in tipos if tipo != "null"] + ["null"]
    return " | ".join(tipos)


def _item(tipo: str) -> str:
    return f"({tipo})" if " | " in tipo else tipo


def _objeto(schema: dict[str, Any]) -> str:
    propriedades: dict[str, Any] = schema.get("properties", {})
    obrigatorios = set(schema.get("required", []))
    if not propriedades:
        return "Record<string, unknown>"
    linhas = []
    for nome, definicao in propriedades.items():
        opcional = "" if nome in obrigatorios else "?"
        linhas.append(f"  {_campo(nome)}{opcional}: {_tipo(definicao)};")
    return "{\n" + "\n".join(linhas) + "\n}"


def _tipo(schema: dict[str, Any]) -> str:
    if not schema:
        return "unknown"
    if "$ref" in schema:
        return _nome(str(schema["$ref"]).rsplit("/", 1)[-1])
    if "const" in schema:
        return _literal(schema["const"])
    if "enum" in schema:
        return " | ".join(_literal(valor) for valor in schema["enum"])
    if "anyOf" in schema:
        return _uniao(schema["anyOf"])
    if "oneOf" in schema:
        return _uniao(schema["oneOf"])
    if "prefixItems" in schema:
        itens = ", ".join(_tipo(item) for item in schema["prefixItems"])
        return f"[{itens}]"

    tipo = schema.get("type")
    if isinstance(tipo, list):
        return _uniao([{**schema, "type": alternativa} for alternativa in tipo])
    if tipo == "string":
        return "string"
    if tipo in ("integer", "number"):
        return "number"
    if tipo == "boolean":
        return "boolean"
    if tipo == "null":
        return "null"
    if tipo == "array":
        itens_array = schema.get("items")
        return f"{_item(_tipo(itens_array))}[]" if isinstance(itens_array, dict) else "unknown[]"
    if "additionalProperties" in schema:
        adicionais = schema["additionalProperties"]
        if isinstance(adicionais, dict):
            return f"Record<string, {_tipo(adicionais)}>"
        return "Record<string, unknown>"
    if tipo == "object" or "properties" in schema:
        return _objeto(schema)
    return "unknown"


def gerar(openapi: dict[str, Any]) -> str:
    """Converte `components.schemas` em declarações TypeScript estáveis."""
    schemas: dict[str, Any] = openapi.get("components", {}).get("schemas", {})
    partes = [CABECALHO]
    for nome in sorted(schemas):
        partes.append(f"export type {_nome(nome)} = {_tipo(schemas[nome])};\n")
    return "\n".join(partes)


if __name__ == "__main__":
    print(gerar(app.openapi()), end="")
