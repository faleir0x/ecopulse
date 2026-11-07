# Imagem única para todos os serviços Python do monorepo.
# Uso: docker build -f infra/docker/python.Dockerfile --build-arg SERVICE=api .
ARG PYTHON_VERSION=3.13

FROM python:${PYTHON_VERSION}-slim AS build
ARG SERVICE
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_NO_CACHE=1
WORKDIR /app
# Dependências primeiro, para aproveitar o cache de camadas
COPY pyproject.toml uv.lock ./
COPY packages/common/pyproject.toml packages/common/
COPY services/${SERVICE}/pyproject.toml services/${SERVICE}/
RUN uv sync --frozen --no-dev --no-install-workspace --package ecopulse-${SERVICE}
COPY packages/common packages/common
COPY services/${SERVICE} services/${SERVICE}
RUN uv sync --frozen --no-dev --no-editable --package ecopulse-${SERVICE}

FROM python:${PYTHON_VERSION}-slim
RUN useradd --system --uid 10001 --no-create-home ecopulse
COPY --from=build /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER 10001
WORKDIR /app
