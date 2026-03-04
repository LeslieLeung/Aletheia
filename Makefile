.PHONY: split-data convert-models train-diveye build

## ── Data ─────────────────────────────────────────────────────────────────────
## Split hc3_all.jsonl into data/train.csv and data/test.csv.
## Run once after downloading the raw dataset.
split-data:
	uv run python scripts/split_dataset.py \
		--input data/hc3_all.jsonl \
		--output_dir data

## ── Models ───────────────────────────────────────────────────────────────────
## Download and export openai-community/gpt2 to ONNX.
## Normally this runs inside the Docker builder stage; run locally only when
## you need the model for training (models/openai-community/ is gitignored).
convert-models:
	uv run python scripts/convert_models.py

## Train the DivEye XGBoost classifier and save to models/diveye/.
## Prerequisites: split-data, convert-models
train-diveye:
	uv run python scripts/train_diveye.py \
		--train_dataset data/train.csv \
		--test_dataset  data/test.csv \
		--model_dir     models/openai-community/gpt2 \
		--output        models/diveye/xgb_classifier.json

## ── Docker ───────────────────────────────────────────────────────────────────
## Build the production image.
## Stage 1 downloads + converts GPT-2; stage 3 copies models/diveye/ from the repo.
build:
	docker build -t aletheia .
