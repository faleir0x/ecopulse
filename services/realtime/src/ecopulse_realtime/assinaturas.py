"""Registro em memória de quem assina o quê, nesta instância.

Contagem de referência por célula: a instância só fica inscrita no canal do Redis enquanto
pelo menos um cliente dela quer aquela célula. Sem I/O (testável isoladamente).
"""

from collections.abc import Hashable
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Mudanca:
    """Células que a INSTÂNCIA passou a precisar (ssubscribe) ou deixou de precisar
    (sunsubscribe)."""

    entrar: frozenset[str] = frozenset()
    sair: frozenset[str] = frozenset()


@dataclass
class Assinaturas[C: Hashable]:
    _por_cliente: dict[C, frozenset[str]] = field(default_factory=dict)
    _por_celula: dict[str, set[C]] = field(default_factory=dict)

    def definir(self, cliente: C, celulas: frozenset[str]) -> Mudanca:
        """Substitui o conjunto do cliente e retorna a mudança no nível da instância."""
        anteriores = self._por_cliente.get(cliente, frozenset())
        if anteriores == celulas:
            return Mudanca()

        entrar: set[str] = set()
        for celula in celulas - anteriores:
            clientes = self._por_celula.setdefault(celula, set())
            if not clientes:
                entrar.add(celula)
            clientes.add(cliente)

        sair: set[str] = set()
        for celula in anteriores - celulas:
            clientes = self._por_celula[celula]
            clientes.discard(cliente)
            if not clientes:
                del self._por_celula[celula]
                sair.add(celula)

        self._por_cliente[cliente] = celulas
        return Mudanca(entrar=frozenset(entrar), sair=frozenset(sair))

    def remover(self, cliente: C) -> Mudanca:
        """Cliente desconectou. `entrar` sempre vazio."""
        anteriores = self._por_cliente.pop(cliente, None)
        if anteriores is None:
            return Mudanca()

        sair: set[str] = set()
        for celula in anteriores:
            clientes = self._por_celula[celula]
            clientes.discard(cliente)
            if not clientes:
                del self._por_celula[celula]
                sair.add(celula)

        return Mudanca(sair=frozenset(sair))

    def clientes(self, celula: str) -> frozenset[C]:
        return frozenset(self._por_celula.get(celula, set()))

    def celulas(self) -> frozenset[str]:
        """Todas as células com pelo menos um cliente."""
        return frozenset(self._por_celula)
