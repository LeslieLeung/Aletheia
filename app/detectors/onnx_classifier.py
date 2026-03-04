from __future__ import annotations

import logging
import os
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

from app.schemas import Strategy

if TYPE_CHECKING:
    from transformers import PreTrainedTokenizerBase

logger = logging.getLogger(__name__)

DEFAULT_EN_MODEL = "yuchuantian/AIGC_detector_env3"
DEFAULT_ZH_MODEL = "yuchuantian/AIGC_detector_zhv3"

MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))

ID2LABEL = ["human", "ai"]

WINDOW_SIZE = 512
STRIDE = 256
EARLY_STOP_THRESHOLD = 0.95
EARLY_STOP_MIN_CHUNKS = 3


def _local_path(model_id: str) -> Path:
    return MODELS_DIR / model_id


def _onnx_file(model_dir: Path) -> Path:
    candidates = list(model_dir.glob("*.onnx"))
    if not candidates:
        raise FileNotFoundError(f"No .onnx file found in {model_dir}")
    return candidates[0]


@dataclass
class _CachedModel:
    session: ort.InferenceSession
    tokenizer: PreTrainedTokenizerBase


@dataclass
class OnnxClassifierDetector:
    """Loads, caches and runs inference with ONNX classification models."""

    _cache: dict[str, _CachedModel] = field(default_factory=dict)

    def load(self, model_id: str) -> _CachedModel:
        if model_id in self._cache:
            return self._cache[model_id]

        local = _local_path(model_id)
        if local.exists():
            logger.info("Loading model %s from local path %s …", model_id, local)
            tokenizer = AutoTokenizer.from_pretrained(str(local))
            session = ort.InferenceSession(str(_onnx_file(local)))
        else:
            logger.warning(
                "Local model not found at %s, downloading from HuggingFace …", local
            )
            from optimum.onnxruntime import ORTModelForSequenceClassification

            tokenizer = AutoTokenizer.from_pretrained(model_id)
            hf_model = ORTModelForSequenceClassification.from_pretrained(
                model_id, export=True
            )
            local.mkdir(parents=True, exist_ok=True)
            tokenizer.save_pretrained(str(local))
            hf_model.save_pretrained(str(local))
            session = ort.InferenceSession(str(_onnx_file(local)))

        entry = _CachedModel(session=session, tokenizer=tokenizer)
        self._cache[model_id] = entry
        logger.info("Model %s ready.", model_id)
        return entry

    def resolve_model_id(self, lang: str, model_id: str | None) -> str:
        if model_id is not None:
            return model_id
        if lang == "zh":
            return DEFAULT_ZH_MODEL
        return DEFAULT_EN_MODEL

    def predict(
        self,
        text: str,
        model_id: str,
        strategy: Strategy = Strategy.TRUNCATE,
        early_stop: bool = False,
    ) -> tuple[str, float, int]:
        """Return ``(label, score, num_chunks)``."""
        entry = self.load(model_id)
        if strategy == Strategy.TRUNCATE:
            return self._predict_truncate(text, entry)
        return self._predict_sliding(text, entry, strategy, early_stop)

    def unload(self) -> None:
        """Release all cached ONNX sessions and tokenizers."""
        count = len(self._cache)
        self._cache.clear()
        if count:
            logger.info("OnnxClassifierDetector: unloaded %d model(s)", count)

    # ------------------------------------------------------------------
    # Prediction internals
    # ------------------------------------------------------------------

    @staticmethod
    def _run(session: ort.InferenceSession, inputs: dict) -> np.ndarray:
        feed = {k: v for k, v in inputs.items() if k in {n.name for n in session.get_inputs()}}
        return session.run(["logits"], feed)[0][0]

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        e = np.exp(x - x.max())
        return e / e.sum()

    @staticmethod
    def _predict_truncate(text: str, entry: _CachedModel) -> tuple[str, float, int]:
        inputs = entry.tokenizer(
            text, return_tensors="np", max_length=WINDOW_SIZE, truncation=True
        )
        logits = OnnxClassifierDetector._run(entry.session, inputs)
        scores = OnnxClassifierDetector._softmax(logits)
        label = ID2LABEL[int(scores.argmax())]
        return label, float(scores.max()), 1

    @staticmethod
    def _predict_sliding(
        text: str,
        entry: _CachedModel,
        strategy: Strategy,
        early_stop: bool = False,
    ) -> tuple[str, float, int]:
        encoding = entry.tokenizer(text, return_tensors="np", truncation=False)
        input_ids = encoding["input_ids"][0]
        total_len = len(input_ids)

        if total_len <= WINDOW_SIZE:
            logits = OnnxClassifierDetector._run(entry.session, encoding)
            scores = OnnxClassifierDetector._softmax(logits)
            label = ID2LABEL[int(scores.argmax())]
            return label, float(scores.max()), 1

        all_scores: list[np.ndarray] = []
        start = 0
        while start < total_len:
            end = min(start + WINDOW_SIZE, total_len)
            chunk_ids = input_ids[start:end][np.newaxis, :]
            attention_mask = np.ones_like(chunk_ids)
            chunk_inputs = {
                "input_ids": chunk_ids,
                "attention_mask": attention_mask,
                "token_type_ids": np.zeros_like(chunk_ids),
            }
            logits = OnnxClassifierDetector._run(entry.session, chunk_inputs)
            scores = OnnxClassifierDetector._softmax(logits)
            all_scores.append(scores)
            if end == total_len:
                break
            if early_stop and len(all_scores) >= EARLY_STOP_MIN_CHUNKS:
                avg_so_far = np.mean(all_scores, axis=0)
                if float(avg_so_far.max()) > EARLY_STOP_THRESHOLD:
                    logger.info(
                        "Early stop after %d chunks (confidence %.3f)",
                        len(all_scores),
                        float(avg_so_far.max()),
                    )
                    break
            start += STRIDE

        num_chunks = len(all_scores)

        if strategy == Strategy.SLIDING_AVG:
            avg = np.mean(all_scores, axis=0)
            label = ID2LABEL[int(avg.argmax())]
            return label, float(avg.max()), num_chunks

        if strategy == Strategy.SLIDING_WEIGHTED_AVG:
            weights = np.array([float(s.max()) for s in all_scores])
            weighted = np.average(all_scores, axis=0, weights=weights)
            label = ID2LABEL[int(weighted.argmax())]
            return label, float(weighted.max()), num_chunks

        # SLIDING_VOTE
        votes = [ID2LABEL[int(s.argmax())] for s in all_scores]
        counter = Counter(votes)
        winner, count = counter.most_common(1)[0]
        return winner, count / num_chunks, num_chunks
