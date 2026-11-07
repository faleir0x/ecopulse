import json
import logging
from types import TracebackType

from ecopulse_common.logs import JsonFormatter, configure_logging


def _record(
    msg: str,
    args: tuple[object, ...] = (),
    *,
    extra: dict[str, object] | None = None,
    exc_info: tuple[type[BaseException], BaseException, TracebackType | None] | None = None,
) -> logging.LogRecord:
    logger = logging.getLogger("ecopulse.teste")
    return logger.makeRecord(
        "ecopulse.teste",
        logging.INFO,
        __file__,
        10,
        msg,
        args,
        exc_info,
        extra=extra,
    )


def test_formata_campos_padrao() -> None:
    formatter = JsonFormatter("api")

    payload = json.loads(formatter.format(_record("olá")))

    assert payload["level"] == "INFO"
    assert payload["service"] == "api"
    assert payload["logger"] == "ecopulse.teste"
    assert payload["msg"] == "olá"
    assert isinstance(payload["ts"], str)
    assert "T" in payload["ts"]


def test_formata_extra_e_interpolacao() -> None:
    formatter = JsonFormatter("processor")

    payload = json.loads(
        formatter.format(
            _record("evento %s", ("criado",), extra={"event_id": "abc", "client_id": "123"})
        )
    )

    assert payload["msg"] == "evento criado"
    assert payload["event_id"] == "abc"
    assert payload["client_id"] == "123"


def test_nao_inclui_atributos_padrao_como_extra() -> None:
    formatter = JsonFormatter("api")

    payload = json.loads(formatter.format(_record("teste")))

    assert "levelno" not in payload
    assert "pathname" not in payload
    assert "args" not in payload
    assert "taskName" not in payload


def test_inclui_excecao_quando_existe() -> None:
    formatter = JsonFormatter("api")
    try:
        raise ValueError("falhou")
    except ValueError as exc:
        record = _record("erro", exc_info=(type(exc), exc, exc.__traceback__))

    payload = json.loads(formatter.format(record))

    assert "exc" in payload
    assert "ValueError: falhou" in payload["exc"]


def test_configure_logging_substitui_handlers() -> None:
    root = logging.getLogger()
    handlers_originais = root.handlers[:]
    nivel_original = root.level
    try:
        configure_logging("api", "debug")

        assert root.level == logging.DEBUG
        assert len(root.handlers) == 1
        handler = root.handlers[0]
        assert isinstance(handler, logging.StreamHandler)
        assert isinstance(handler.formatter, JsonFormatter)
    finally:
        for handler in root.handlers[:]:
            root.removeHandler(handler)
        for handler in handlers_originais:
            root.addHandler(handler)
        root.setLevel(nivel_original)
