"""IP real do cliente atrás de um proxy reverso (API e realtime).

O IP vem de um cabeçalho só quando a conexão chega de um proxy confiável (túnel da Cloudflare,
Caddy ou Nginx Proxy Manager); de qualquer outro lugar o cabeçalho é ignorado, então o cliente
não consegue forjar o próprio IP. Proxies confiáveis: IPs ou faixas (CIDR) separados por vírgula
em ECOPULSE_PROXIES_CONFIAVEIS — no Docker Swarm o IP do proxy muda a cada reinício, então a
faixa da rede dele é o que vale.

IPv6 vira a rede /64: um cliente troca de endereço dentro do mesmo /64, mas não de rede.
"""

import ipaddress
from collections.abc import Mapping

Rede = ipaddress.IPv4Network | ipaddress.IPv6Network

# Em ordem de preferência: Cloudflare (túnel/proxy) e Caddy mandam CF-Connecting-IP; o Nginx
# Proxy Manager manda X-Real-IP. X-Forwarded-For nunca: é uma lista que o cliente pode prefixar.
CABECALHOS_IP: tuple[str, ...] = ("cf-connecting-ip", "x-real-ip")


def redes_confiaveis(texto: str) -> tuple[Rede, ...]:
    """Lê "10.0.0.5, 10.89.70.0/24" em redes (um IP vira /32 ou /128).
    Entrada inválida → ValueError."""
    return tuple(
        ipaddress.ip_network(item.strip(), strict=False)
        for item in texto.split(",")
        if item.strip()
    )


def _confiavel(direto: str, confiaveis: tuple[Rede, ...]) -> bool:
    try:
        endereco = ipaddress.ip_address(direto)
    except ValueError:
        return False
    return any(endereco in rede for rede in confiaveis)


def _normalizar(candidato: str) -> str:
    try:
        endereco = ipaddress.ip_address(candidato)
    except ValueError:
        return candidato
    if isinstance(endereco, ipaddress.IPv6Address):
        return str(ipaddress.ip_network(f"{endereco}/64", strict=False))
    return str(endereco)


def ip_cliente(direto: str, cabecalhos: Mapping[str, str], confiaveis: tuple[Rede, ...]) -> str:
    """IP do cliente: o do primeiro cabeçalho de CABECALHOS_IP com IP válido se `direto` é um
    proxy confiável; senão o próprio `direto`. Sempre normalizado (IPv6 → /64)."""
    if _confiavel(direto, confiaveis):
        for nome in CABECALHOS_IP:
            valor = cabecalhos.get(nome, "").strip()
            try:
                return _normalizar(str(ipaddress.ip_address(valor)))
            except ValueError:
                continue
    return _normalizar(direto)
