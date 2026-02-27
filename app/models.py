from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np
from optimum.onnxruntime import ORTModelForSequenceClassification
from transformers import AutoTokenizer

from app.schemas import Strategy

if TYPE_CHECKING:
    from optimum.onnxruntime import ORTModelForSequenceClassification as OrtModel
    from transformers import PreTrainedTokenizerBase

logger = logging.getLogger(__name__)

DEFAULT_EN_MODEL = "yuchuantian/AIGC_detector_env3"
DEFAULT_ZH_MODEL = "yuchuantian/AIGC_detector_zhv3"

ID2LABEL = ["human", "ai"]

WINDOW_SIZE = 512
STRIDE = 256
EARLY_STOP_THRESHOLD = 0.95
EARLY_STOP_MIN_CHUNKS = 3


@dataclass
class _CachedModel:
    model: OrtModel
    tokenizer: PreTrainedTokenizerBase


@dataclass
class ModelManager:
    """Loads, caches and runs inference with HuggingFace classification models."""

    _cache: dict[str, _CachedModel] = field(default_factory=dict)

    def load(self, model_id: str) -> _CachedModel:
        if model_id in self._cache:
            return self._cache[model_id]
        logger.info("Loading model %s …", model_id)
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        model = ORTModelForSequenceClassification.from_pretrained(model_id, export=True)
        entry = _CachedModel(model=model, tokenizer=tokenizer)
        self._cache[model_id] = entry
        logger.info("Model %s loaded.", model_id)
        return entry

    def load_defaults(self) -> None:
        self.load(DEFAULT_EN_MODEL)
        self.load(DEFAULT_ZH_MODEL)

    def resolve_model_id(self, lang: str, model_id: str | None) -> str:
        if model_id is not None:
            return model_id
        if lang == "zh":
            return DEFAULT_ZH_MODEL
        return DEFAULT_EN_MODEL

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------

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

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        e = np.exp(x - x.max())
        return e / e.sum()

    @staticmethod
    def _predict_truncate(text: str, entry: _CachedModel) -> tuple[str, float, int]:
        inputs = entry.tokenizer(
            text, return_tensors="np", max_length=WINDOW_SIZE, truncation=True
        )
        logits = entry.model(**inputs).logits[0]
        scores = ModelManager._softmax(logits)
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
            logits = entry.model(**encoding).logits[0]
            scores = ModelManager._softmax(logits)
            label = ID2LABEL[int(scores.argmax())]
            return label, float(scores.max()), 1

        all_scores: list[np.ndarray] = []
        start = 0
        while start < total_len:
            end = min(start + WINDOW_SIZE, total_len)
            chunk_ids = input_ids[start:end][np.newaxis, :]
            attention_mask = np.ones_like(chunk_ids)
            logits = entry.model(
                input_ids=chunk_ids, attention_mask=attention_mask
            ).logits[0]
            scores = ModelManager._softmax(logits)
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
