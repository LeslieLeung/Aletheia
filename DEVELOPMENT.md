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

## Browser extension

The extension source is in [`extension/`](extension/). The content script extracts article text, the background script sends requests, and the badge displays the AI result and optional content category. Settings are stored with `chrome.storage`, which Firefox also provides. The content engine defaults to `off`.

Firefox still has no extension service workers. The manifest lists `background.scripts` for Firefox's event page and `background.service_worker` for Chrome. Chrome 121 and newer ignores `scripts` in a Manifest V3 extension. `background/service-worker.js` calls `importScripts` only when that function exists, so the same file is the last event-page script on Firefox and the service worker on Chrome. `browser_specific_settings.gecko` sets a stable add-on ID, requires Firefox 140, and declares that detection transmits page text and the page URL. Firefox for Android requires 142 for that declaration. Its add-on manager still cannot show or edit host-permission grants, so Android is not a supported target.

Server mode posts to the configured Aletheia `/detect` endpoint. The extension can select a detector and content engine independently. When Jev is selected for both, the API combines the judgments into one engine call.

Shared scripts keep the `ALETHEIA` namespace on `globalThis`. Firefox content scripts have a global scope distinct from `self`/`window`, so reading the namespace from `self` would discard helpers loaded by earlier scripts. Run `node --test scripts/test_extension.cjs` to check content-script initialization and manual detection with both global-scope models, plus Firefox event-page and Chrome service-worker initialization. These tests use mocked browser APIs and do not replace a browser smoke test.

Local mode skips the Aletheia API and routes through the selected local engine. The extension currently supports Jev, calling the configured server's `POST /v1/systemone` with the API key kept in `chrome.storage.local`. The shared question and response helpers in `extension/shared/questions.js` provide the common contract for additional engines.
