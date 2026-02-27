# ─── Stage 1: convert ────────────────────────────────────────────────────────
# Downloads HF models and exports them to ONNX. Uses CPU-only torch to keep the
# layer small; this stage is never included in the final image.
FROM python:3.14-slim-bookworm AS converter

WORKDIR /app

RUN pip install --no-cache-dir "optimum[exporters,onnxruntime]" transformers && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY scripts/convert_models.py scripts/convert_models.py

ENV MODELS_DIR=/app/models

RUN python scripts/convert_models.py


# ─── Stage 2: build venv (inference deps only, no torch) ─────────────────────
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY app/ app/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev


# ─── Stage 3: final runtime image ────────────────────────────────────────────
FROM python:3.12-slim-bookworm

WORKDIR /app

COPY --from=builder /app /app
COPY --from=converter /app/models /app/models

ENV PATH="/app/.venv/bin:$PATH" \
    MODELS_DIR=/app/models

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
