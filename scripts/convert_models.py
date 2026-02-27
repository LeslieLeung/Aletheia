#!/usr/bin/env python3
"""Convert HuggingFace PyTorch models to ONNX format for CPU inference."""

import os
from pathlib import Path

from optimum.onnxruntime import ORTModelForSequenceClassification
from transformers import AutoTokenizer

MODELS = [
    "yuchuantian/AIGC_detector_env3",
    "yuchuantian/AIGC_detector_zhv3",
]

MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))


def convert(model_id: str) -> None:
    out = MODELS_DIR / model_id
    out.mkdir(parents=True, exist_ok=True)
    print(f"[convert] {model_id} -> {out}")

    tokenizer = AutoTokenizer.from_pretrained(model_id)
    tokenizer.save_pretrained(out)

    model = ORTModelForSequenceClassification.from_pretrained(model_id, export=True)
    model.save_pretrained(out)

    print(f"[convert] done: {out}")


if __name__ == "__main__":
    for mid in MODELS:
        convert(mid)
    print("[convert] all models converted.")
