"""DivEye detector: surprisal diversity analysis for AI text detection."""

from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

from app.schemas import Strategy

logger = logging.getLogger(__name__)

MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))
GPT2_MODEL_DIR = MODELS_DIR / "openai-community" / "gpt2"
XGBOOST_MODEL_PATH = MODELS_DIR / "diveye" / "xgb_classifier.json"

ID2LABEL = ["human", "ai"]
MIN_TEXT_LENGTH = 50


class DivEyeDetector:
    """Detect AI-generated text using surprisal diversity features + XGBoost."""

    def __init__(self) -> None:
        self._extractor = None
        self._classifier = None

    def _ensure_loaded(self) -> None:
        if self._extractor is not None and self._classifier is not None:
            return

        from app.detectors.features import SurprisalExtractor

        logger.info("DivEyeDetector: loading models …")
        self._extractor = SurprisalExtractor(GPT2_MODEL_DIR)

        import xgboost as xgb

        self._classifier = xgb.XGBClassifier()
        self._classifier.load_model(str(XGBOOST_MODEL_PATH))
        logger.info("DivEyeDetector: models ready.")

    def resolve_model_id(self, lang: str, model_id: str | None) -> str:
        return model_id or "diveye"

    def predict(
        self,
        text: str,
        model_id: str,
        strategy: Strategy = Strategy.TRUNCATE,
        early_stop: bool = False,
    ) -> tuple[str, float, int]:
        """Return ``(label, score, num_chunks)``."""
        if len(text) < MIN_TEXT_LENGTH:
            return "human", 0.5, 1

        self._ensure_loaded()
        if self._extractor is None or self._classifier is None:
            raise RuntimeError("Failed to load DivEye models")

        features = self._extractor.extract_features(text)
        features_2d = features.reshape(1, -1)

        proba = self._classifier.predict_proba(features_2d)[0]  # [p_human, p_ai]
        pred_idx = int(np.argmax(proba))
        label = ID2LABEL[pred_idx]
        score = float(proba[pred_idx])

        return label, score, 1

    def unload(self) -> None:
        """Release GPT-2 ONNX session and XGBoost model."""
        self._extractor = None
        self._classifier = None
        logger.info("DivEyeDetector: models unloaded.")
