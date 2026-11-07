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
