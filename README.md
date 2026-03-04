# Aletheia – AIGC Text Detector API

[中文文档](README_zh.md)

A FastAPI service for detecting AI-generated text, based on [AIGC_text_detector](https://github.com/YuchuanTian/AIGC_text_detector) and [DivEye](https://github.com/IBM/diveye).

## Quick Start (Docker)

```bash
# Using the pre-built image from GHCR
docker compose -f docker-compose.yml up
```

The API will be available at `http://localhost:8000`.

## Chrome Extension

A Chrome extension is available that automatically detects AI-generated text on article pages you visit.

### Install

1. Go to the [Releases](https://github.com/LeslieLeung/Aletheia/releases) page and download the latest `aletheia-extension-*.zip`.
2. Unzip the file.
3. Open `chrome://extensions` in Chrome, enable **Developer mode**.
4. Click **Load unpacked** and select the unzipped folder.

### Configure

Click the extension icon to open the popup. Set the **API URL** to point to your running Aletheia instance (default: `http://localhost:8000`). For more options (detection strategy, domain whitelist/blacklist), go to the extension's **Settings** page.

The extension will automatically detect article content on pages you visit and show a floating badge with the result.

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
| `strategy`   | string | no       | `"truncate"` | `"truncate"`, `"sliding_avg"`, `"sliding_weighted_avg"`, or `"sliding_vote"` |
| `early_stop` | bool   | no       | `false`      | Stop early when confidence is high enough (sliding strategies only)           |

**Strategies:**

- `truncate` – Truncate to 512 tokens. Fast, single forward pass.
- `sliding_avg` – Sliding window (512 tokens, stride 256). Average softmax scores across windows.
- `sliding_weighted_avg` – Sliding window. Confidence-weighted average: chunks with higher confidence contribute more.
- `sliding_vote` – Sliding window. Majority vote on predicted label across windows.

> **Note:** For most use cases, `truncate` is sufficient. For long texts where you want higher accuracy, use `sliding_weighted_avg` with `early_stop` enabled — it gives better results than plain averaging by weighting high-confidence chunks more heavily, and early stopping avoids unnecessary computation when the result is already clear.

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

## Detection Methods

### AIGC Text Detector

Transformer-based sequence classifiers fine-tuned for AI-text detection.
Source: [YuchuanTian/AIGC_text_detector](https://github.com/YuchuanTian/AIGC_text_detector).

### DivEye

DivEye detects AI-generated text using surprisal-based statistical features that capture how unpredictability varies throughout a text. Human writing exhibits greater variability in lexical and structural unpredictability compared to LLM outputs. These features feed an XGBoost classifier, making it interpretable and robust to paraphrasing attacks.

> Advik Raj Basani, Pin-Yu Chen. *Diversity Boosts AI-Generated Text Detection.* TMLR 2026.

Source: [IBM/diveye](https://github.com/IBM/diveye)
