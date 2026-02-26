# Aletheia – AIGC Text Detector API

A FastAPI service for detecting AI-generated text, based on [AIGC_text_detector](https://github.com/YuchuanTian/AIGC_text_detector).

## Quick Start (Docker)

```bash
# Using the pre-built image from GHCR
docker compose -f docker-compose.yml up
```

The API will be available at `http://localhost:8000`.

## Local Development

Requires [uv](https://docs.astral.sh/uv/).

```bash
# Install dependencies
uv sync

# Run the server
uv run uvicorn app.main:app --reload
```

Or with Docker Compose:

```bash
docker compose up --build
```

## API

### `POST /detect`

Detect whether text is human-written or AI-generated.

**Request body:**

| Field      | Type   | Required | Default      | Description                                                                 |
|------------|--------|----------|--------------|-----------------------------------------------------------------------------|
| `text`     | string | yes      |              | Text to detect                                                              |
| `lang`     | string | no       | auto-detect  | `"zh"` for Chinese model, anything else for English                         |
| `model_id` | string | no       | (by lang)    | HuggingFace model ID; overrides `lang`                                      |
| `strategy` | string | no       | `"truncate"` | `"truncate"`, `"sliding_avg"`, or `"sliding_vote"` for long text handling   |

**Strategies:**

- `truncate` – Truncate to 512 tokens. Fast, single forward pass.
- `sliding_avg` – Sliding window (512 tokens, stride 256). Average softmax scores across windows.
- `sliding_vote` – Sliding window. Majority vote on predicted label across windows.

**Example:**

```bash
curl -X POST http://localhost:8000/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "This is a sample text to detect."}'
```

**Response:**

```json
{
  "label": "human",
  "score": 0.98,
  "model_id": "yuchuantian/AIGC_detector_env3",
  "detected_lang": "en",
  "num_chunks": 1
}
```

### `GET /health`

Health check endpoint.

## Default Models

| Language | Model ID                            |
|----------|-------------------------------------|
| English  | `yuchuantian/AIGC_detector_env3`    |
| Chinese  | `yuchuantian/AIGC_detector_zhv3`    |

You can use any HuggingFace `*ForSequenceClassification` model by passing `model_id` in the request.
