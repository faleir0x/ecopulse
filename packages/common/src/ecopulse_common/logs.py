"""Logs estruturados em JSON (uma linha por evento)."""

import json
import logging
import sys
from datetime import UTC, datetime

_ATRIBUTOS_PADRAO = frozenset(vars(logging.LogRecord("", 0, "", 0, "", (), None)).keys()) | {
    "message",
    "asctime",
    "exc_text",
}


class JsonFormatter(logging.Formatter):
    """Formata como JSON: ts (ISO 8601 UTC), level, service, logger, msg,
    mais qualquer chave passada em `extra=` (ex.: event_id, client_id) e `exc` se houver exceção."""

    def __init__(self, service: str) -> None:
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        extras = {
            chave: valor for chave, valor in vars(record).items() if chave not in _ATRIBUTOS_PADRAO
        }
        payload: dict[str, object] = {
            **extras,
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "service": self.service,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(service: str, level: str = "INFO") -> None:
    """Substitui os handlers do root logger por um StreamHandler(stdout) com JsonFormatter."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(service))

    root = logging.getLogger()
    for antigo in root.handlers[:]:
        root.removeHandler(antigo)
        antigo.close()
    root.addHandler(handler)
    root.setLevel(level.upper())
