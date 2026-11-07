from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração comum lida de variáveis de ambiente (prefixo ECOPULSE_)."""

    model_config = SettingsConfigDict(env_prefix="ECOPULSE_")

    rabbit_url: str = "amqp://ecopulse:ecopulse@localhost:5672/"
    database_url: str = "postgresql://ecopulse:ecopulse@localhost:5432/ecopulse"
    redis_nodes: str = "localhost:7001,localhost:7002,localhost:7003"
    log_level: str = "INFO"
