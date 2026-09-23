# Development

This document covers the implementation and development workflow for Aletheia. For installation and usage, see the [English README](README.md) or [Chinese README](README_zh.md).

## Local setup

Use Python 3.12 or 3.13 and [uv](https://docs.astral.sh/uv/):

```bash
uv sync
uv run uvicorn app.main:app --reload
```

The server listens at `http://localhost:8000`. The interactive API reference is available at `/docs`, and `GET /health` returns `{"status":"ok"}`.

To build and run the production image locally:

```bash
docker compose up --build
```

The root `compose.yaml` builds the local Dockerfile. `docker-compose.yml` uses the published GHCR image.

## Request flow

`POST /detect` is implemented in [`app/main.py`](app/main.py), with request and response models in [`app/schemas.py`](app/schemas.py). Language is detected when `lang` is omitted. The default AI detector is `onnx_classifier`; `diveye` and `jev` are alternatives. Content classification is optional: setting `content_engine` to `jev` adds an `original`, `repost`, or `ad` judgment to the response.

The response always contains the AI judgment (`label`, `score`, `model_id`, `detected_lang`, `num_chunks`, and `detector`). When content classification is requested, it also contains `content.engine`, `content.model_id`, `content.label`, `content.confidence`, and `content.probabilities`. If both `detector` and `content_engine` are `jev`, one decision-engine call produces both judgments.

The `title` and `url` fields are passed to decision engines with the text. The ONNX detector uses `model_id`, `strategy`, and `early_stop`. DivEye and Jev do not use those options for inference. A missing Jev API key returns HTTP 503.

## AI detectors

### ONNX classifier

The default detector uses transformer sequence classifiers from [AIGC_text_detector](https://github.com/YuchuanTian/AIGC_text_detector). Default model IDs are:

| Language | Model ID |
| --- | --- |
| English | `yuchuantian/AIGC_detector_env3` |
| Chinese | `yuchuantian/AIGC_detector_zhv3` |

`model_id` overrides the language default and can point to another Hugging Face sequence-classification model. Model loading and inference are implemented in [`app/detectors/onnx_classifier.py`](app/detectors/onnx_classifier.py).

The ONNX classifier supports four long-text strategies:

| Strategy | Behavior |
| --- | --- |
| `truncate` | Use the first 512 tokens in one pass. This is the API default. |
| `sliding_avg` | Use 512-token windows with a stride of 256 and average their softmax scores. |
| `sliding_weighted_avg` | Use the same windows and weight their scores by confidence. |
| `sliding_vote` | Use the same windows and choose the majority label. |

`early_stop` can stop sliding-window processing after a sufficiently confident result. It defaults to `false` in the API request. The extension uses `sliding_weighted_avg` with `early_stop` enabled by default.

### DivEye

[DivEye](https://github.com/IBM/diveye) uses surprisal-based statistical features and an XGBoost classifier to distinguish human and AI-generated text. The implementation is in [`app/detectors/diveye.py`](app/detectors/diveye.py) and [`app/detectors/features.py`](app/detectors/features.py). Its model is stored at `models/diveye/xgb_classifier.json`.

Reference: Advik Raj Basani and Pin-Yu Chen, *Diversity Boosts AI-Generated Text Detection*, TMLR 2026.

The dataset split, ONNX export, and DivEye training commands are available through the Makefile:

```bash
make split-data
make convert-models
make train-diveye
```

`split-data` expects `data/hc3_all.jsonl`. `train-diveye` expects the generated `data/train.csv`, `data/test.csv`, and the locally exported GPT-2 model. See the [DivEye training guide](docs/train_diveye.md) for the full workflow.

### Jev

[Jev](https://docs.typesafe.ai/introduction) is a TypeSafe decision engine that can answer the AI-generation question, the content-classification question, or both. Its implementation is in [`app/engines/jev.py`](app/engines/jev.py). The question specifications are plain data in [`app/engines/questions.py`](app/engines/questions.py).

Set `TYPESAFE_API_KEY` in the server environment to use Jev. `TYPESAFE_BASE_URL` and `TYPESAFE_DEFAULT_MODEL` are optional; the default model is `jev-latest`. For Docker Compose, pass the key through the shell environment:

```bash
export TYPESAFE_API_KEY="your-key"
docker compose up --build
```

To add another decision engine, implement `DecisionEngine.judge(state, *, include_ai, include_content)` in `app/engines`, register the instance in [`app/main.py`](app/main.py), and add its name to `DetectorType` and/or `ContentEngine` in [`app/schemas.py`](app/schemas.py).

## Chrome extension

The extension source is in [`extension/`](extension/). The content script extracts article text, the background service worker sends requests to `/detect`, and the badge displays the AI result and optional content category. Settings are stored in Chrome extension storage. The content engine defaults to `off`.

The extension can select a detector and content engine independently. When Jev is selected for both, the API combines the judgments into one engine call.
