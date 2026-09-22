# Aletheia – AIGC Text Detector API

[中文文档](README_zh.md)

A FastAPI service for detecting AI-generated text, based on [AIGC_text_detector](https://github.com/YuchuanTian/AIGC_text_detector), [DivEye](https://github.com/IBM/diveye), and [Jev](https://docs.typesafe.ai/introduction). Jev can also classify a page as original, repost, or an advertisement.

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
| `model_id` | string | no       | (by lang)    | HuggingFace model ID; overrides `lang`. Ignored by `jev`.                   |
| `strategy`   | string | no       | `"truncate"` | `"truncate"`, `"sliding_avg"`, `"sliding_weighted_avg"`, or `"sliding_vote"`. Ignored by `jev`. |
| `early_stop` | bool   | no       | `false`      | Stop early when confidence is high enough (sliding strategies only). Ignored by `jev`. |
| `detector`   | string | no       | `"onnx_classifier"` | `"onnx_classifier"` (AIGC Detector), `"diveye"`, or `"jev"` |
| `title`      | string | no       |              | Page title. Sent to a decision engine with the text. |
| `url`        | string | no       |              | Page URL. Sent to a decision engine with the text. |
| `content_engine` | string | no   |              | `"jev"` to also classify the page as original, repost, or ad. Omit to skip. |

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
  "num_chunks": 1,
  "detector": "onnx_classifier"
}
```

With `content_engine` set, the response also includes `content`. `label` is one of `original` (原创), `repost` (搬运), or `ad` (广告; both 软广 and 硬广). When `detector` and `content_engine` are both `jev`, both judgments come from one API call.

```json
{
  "label": "ai",
  "score": 0.91,
  "model_id": "jev-latest",
  "detected_lang": "zh",
  "num_chunks": 1,
  "detector": "jev",
  "content": {
    "engine": "jev",
    "model_id": "jev-latest",
    "label": "ad",
    "confidence": 0.81,
    "probabilities": {"original": 0.07, "repost": 0.12, "ad": 0.81}
  }
}
```

Jev reads `TYPESAFE_API_KEY` on the server (optional `TYPESAFE_BASE_URL` and `TYPESAFE_DEFAULT_MODEL`, default `jev-latest`). A missing key returns HTTP 503. Pass the key through when starting Compose:

```bash
export TYPESAFE_API_KEY="your-key"
docker compose up --build
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

### Jev

[Jev](https://docs.typesafe.ai/introduction) is a TypeSafe decision model. It can answer the AI question and the content question (原创 / 搬运 / 广告) in one request. The question text lives in [`app/engines/questions.py`](app/engines/questions.py) as plain data, not as SDK types.

To add another decision engine, implement `DecisionEngine.judge(state, *, include_ai, include_content)` in `app/engines`, register the instance in [`app/main.py`](app/main.py), and add its name to `DetectorType` and `ContentEngine` in [`app/schemas.py`](app/schemas.py). The `/detect` request and response stay the same.
