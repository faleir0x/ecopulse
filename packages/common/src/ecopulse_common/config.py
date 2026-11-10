from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração comum lida de variáveis de ambiente (prefixo ECOPULSE_)."""

    model_config = SettingsConfigDict(env_prefix="ECOPULSE_")

    rabbit_url: str = "amqp://ecopulse:ecopulse@localhost:5672/"
    database_url: str = "postgresql://ecopulse:ecopulse@localhost:5432/ecopulse"
    # "host:porta" separados por vírgula; basta um nó para descobrir o cluster
    redis_nodes: str = "localhost:7001,localhost:7002,localhost:7003"
    # Fora do Docker os nós anunciam "redis-N"; isto remapeia para localhost
    redis_remap_localhost: bool = False
    # Nº de filas-partição do consistent hash exchange
    partitions: int = 3
    log_level: str = "INFO"
    # Documentação interativa (/docs, /redoc, /openapi.json): desligue em produção
    api_docs: bool = True
    # OpenRouteService: a chave fica só no servidor (nunca vai ao app)
    ors_api_key: str = ""
    ors_url: str = "https://api.openrouteservice.org"
    # IPs (vírgula) de proxies confiáveis: só deles a API aceita CF-Connecting-IP (túnel)
    proxies_confiaveis: str = ""
    # environment: "open-meteo" (real) ou "simulador" (demo offline / onda de calor)
    ambiente_fonte: str = "open-meteo"
    ambiente_intervalo_s: int = 600
    # notifier: conta de serviço do Firebase (FCM). Sem o arquivo, só registra em log o que
    # enviaria (modo simulado, usado no CI e em quem não configurou o Firebase)
    firebase_credenciais: str = "/run/secrets/ecopulse/firebase.json"
