"""Regras de teste comuns a todo o monorepo.

Os testes de integração pulam quando a infraestrutura não responde, para rodarem em qualquer
máquina. No CI isso esconderia uma infra quebrada atrás de um job verde: com
ECOPULSE_EXIGIR_INFRA=1, um teste de integração pulado vira falha.
"""

import os
from collections.abc import Generator
from typing import Any

import pytest


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(
    item: pytest.Item, call: pytest.CallInfo[None]
) -> Generator[None, Any]:
    resultado = yield
    relatorio: pytest.TestReport = resultado.get_result()
    if (
        os.environ.get("ECOPULSE_EXIGIR_INFRA") == "1"
        and relatorio.skipped
        and item.get_closest_marker("integration") is not None
    ):
        relatorio.outcome = "failed"
        relatorio.longrepr = (
            f"teste de integração pulado com ECOPULSE_EXIGIR_INFRA=1 "
            f"(infraestrutura indisponível?): {relatorio.longrepr}"
        )
