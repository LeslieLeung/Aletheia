#!/usr/bin/env python3
"""Convert HuggingFace PyTorch models to ONNX format for CPU inference."""

import os
from pathlib import Path

from optimum.onnxruntime import ORTModelForCausalLM, ORTModelForSequenceClassification
from transformers import AutoTokenizer

CLASSIFICATION_MODELS = [
    "yuchuantian/AIGC_detector_env3",
    "yuchuantian/AIGC_detector_zhv3",
]

CAUSAL_LM_MODELS = [
    "openai-community/gpt2",
]

MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))


def convert_classification(model_id: str) -> None:
    out = MODELS_DIR / model_id
    out.mkdir(parents=True, exist_ok=True)
    print(f"[convert] classification: {model_id} -> {out}")

    tokenizer = AutoTokenizer.from_pretrained(model_id)
    tokenizer.save_pretrained(out)

    model = ORTModelForSequenceClassification.from_pretrained(model_id, export=True)
    model.save_pretrained(out)

    print(f"[convert] done: {out}")


def convert_causal_lm(model_id: str) -> None:
    out = MODELS_DIR / model_id
    out.mkdir(parents=True, exist_ok=True)
    print(f"[convert] causal LM: {model_id} -> {out}")

    tokenizer = AutoTokenizer.from_pretrained(model_id)
    tokenizer.save_pretrained(out)

    model = ORTModelForCausalLM.from_pretrained(model_id, export=True, use_cache=False)
    model.save_pretrained(out)

    print(f"[convert] done: {out}")


if __name__ == "__main__":
    for mid in CLASSIFICATION_MODELS:
        convert_classification(mid)
    for mid in CAUSAL_LM_MODELS:
        convert_causal_lm(mid)
    print("[convert] all models converted.")
