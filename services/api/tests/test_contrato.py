from pathlib import Path
from typing import Any

from ecopulse_api.contrato import gerar
from ecopulse_api.main import app

COMANDO = "uv run python -m ecopulse_api.contrato > mobile/src/api/contrato.gerado.ts"
RAIZ = Path(__file__).resolve().parents[3]
CONTRATO = RAIZ / "mobile" / "src" / "api" / "contrato.gerado.ts"


def test_contrato_commitado_em_dia() -> None:
    esperado = gerar(app.openapi())
    assert CONTRATO.exists(), f"contrato gerado ausente; rode: {COMANDO}"
    assert CONTRATO.read_text(encoding="utf-8") == esperado, (
        f"mobile/src/api/contrato.gerado.ts difere do OpenAPI; rode: {COMANDO}"
    )


def _contrato(schema: dict[str, Any], extras: dict[str, Any] | None = None) -> str:
    schemas = {"Exemplo": schema, **(extras or {})}
    return gerar({"components": {"schemas": schemas}})


def test_objeto_com_campo_opcional_e_obrigatorio() -> None:
    texto = _contrato(
        {
            "type": "object",
            "properties": {"obrigatorio": {"type": "string"}, "opcional": {"type": "integer"}},
            "required": ["obrigatorio"],
        }
    )
    assert "export type Exemplo = {\n  obrigatorio: string;\n  opcional?: number;\n};" in texto


def test_nullable_vira_uniao_com_null() -> None:
    texto = _contrato(
        {
            "type": "object",
            "properties": {"valor": {"anyOf": [{"type": "null"}, {"type": "string"}]}},
            "required": ["valor"],
        }
    )
    assert "valor: string | null;" in texto


def test_enum_de_strings_vira_uniao_de_literais() -> None:
    texto = _contrato({"type": "string", "enum": ["baixo", "alto"]})
    assert "export type Exemplo = 'baixo' | 'alto';" in texto


def test_array_envolve_o_tipo_do_item() -> None:
    texto = _contrato(
        {
            "type": "object",
            "properties": {"itens": {"type": "array", "items": {"type": "number"}}},
            "required": ["itens"],
        }
    )
    assert "itens: number[];" in texto


def test_ref_usa_o_nome_do_schema() -> None:
    texto = _contrato(
        {
            "type": "object",
            "properties": {"alvo": {"$ref": "#/components/schemas/Alvo"}},
            "required": ["alvo"],
        },
        extras={"Alvo": {"type": "object", "properties": {}, "required": []}},
    )
    assert "alvo: Alvo;" in texto
    assert "export type Alvo = Record<string, unknown>;" in texto
