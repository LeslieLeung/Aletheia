"""Surprisal feature extraction using ONNX GPT-2."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

logger = logging.getLogger(__name__)

NUM_FEATURES = 10
HISTOGRAM_BINS = 20


class SurprisalExtractor:
    """Compute token-level surprisal from an ONNX GPT-2 model and extract
    statistical features used by the DivEye classifier."""

    def __init__(self, model_dir: Path) -> None:
        logger.info("Loading GPT-2 ONNX model from %s …", model_dir)
        onnx_path = self._find_onnx(model_dir)
        self._session = ort.InferenceSession(str(onnx_path))
        self._output_name = self._session.get_outputs()[0].name
        self._tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
        if self._tokenizer.pad_token is None:
            self._tokenizer.pad_token = self._tokenizer.eos_token
        logger.info("GPT-2 ONNX model ready.")

    @staticmethod
    def _find_onnx(model_dir: Path) -> Path:
        candidates = list(model_dir.glob("*.onnx"))
        if not candidates:
            raise FileNotFoundError(f"No .onnx file found in {model_dir}")
        return candidates[0]

    def compute_surprisal(self, text: str) -> np.ndarray:
        """Return a 1-D array of per-token surprisal values."""
        encoding = self._tokenizer(text, return_tensors="np", max_length=1024, truncation=True)
        input_ids = encoding["input_ids"]  # (1, seq_len)
        attention_mask = encoding.get("attention_mask", np.ones_like(input_ids))

        input_names = {inp.name for inp in self._session.get_inputs()}
        feed: dict[str, np.ndarray] = {"input_ids": input_ids}
        if "attention_mask" in input_names:
            feed["attention_mask"] = attention_mask
        if "position_ids" in input_names:
            seq_len = input_ids.shape[1]
            feed["position_ids"] = np.arange(seq_len, dtype=np.int64).reshape(1, -1)

        logits = self._session.run([self._output_name], feed)[0]  # (1, seq_len, vocab)
        logits = logits[0]  # (seq_len, vocab)

        # Log-softmax (numerically stable)
        max_logits = logits.max(axis=-1, keepdims=True)
        shifted = logits - max_logits
        log_probs = shifted - np.log(np.exp(shifted).sum(axis=-1, keepdims=True))

        # Surprisal for each token (except the first, which has no preceding context)
        tokens = input_ids[0]  # (seq_len,)
        seq_len = len(tokens)
        if seq_len < 2:
            return np.array([], dtype=np.float64)

        # For token at position t, surprisal = -log_prob predicted at position t-1
        surprisal = np.empty(seq_len - 1, dtype=np.float64)
        for t in range(1, seq_len):
            surprisal[t - 1] = -log_probs[t - 1, tokens[t]]

        return surprisal

    def extract_features(self, text: str) -> np.ndarray:
        """Extract 10 statistical features from surprisal values.

        Returns a 1-D array of shape (10,). Returns zeros if text is too short.
        """
        surprisal = self.compute_surprisal(text)

        if len(surprisal) < 3:
            return np.zeros(NUM_FEATURES, dtype=np.float64)

        mean_s = np.mean(surprisal)
        std_s = np.std(surprisal)
        var_s = np.var(surprisal)

        # Skewness
        if std_s > 0:
            skew_s = float(np.mean(((surprisal - mean_s) / std_s) ** 3))
        else:
            skew_s = 0.0

        # Kurtosis (excess)
        if std_s > 0:
            kurt_s = float(np.mean(((surprisal - mean_s) / std_s) ** 4)) - 3.0
        else:
            kurt_s = 0.0

        # First-order differences
        diff1 = np.diff(surprisal)
        mean_diff = np.mean(diff1) if len(diff1) > 0 else 0.0
        std_diff = np.std(diff1) if len(diff1) > 0 else 0.0

        # Second-order differences (of log-likelihood, i.e., negative surprisal)
        log_likelihood = -surprisal
        diff2 = np.diff(log_likelihood, n=2)

        if len(diff2) > 0:
            var_2nd = float(np.var(diff2))

            # Entropy of second-order diff histogram
            hist, _ = np.histogram(diff2, bins=HISTOGRAM_BINS, density=True)
            # Normalize to probability distribution
            hist_sum = hist.sum()
            if hist_sum > 0:
                p = hist / hist_sum
                p = p[p > 0]
                entropy_2nd = float(-np.sum(p * np.log(p)))
            else:
                entropy_2nd = 0.0

            # Autocorrelation of second-order diff
            d2_centered = diff2 - np.mean(diff2)
            d2_var = np.var(diff2)
            if d2_var > 0 and len(d2_centered) > 1:
                autocorr_2nd = float(
                    np.sum(d2_centered[:-1] * d2_centered[1:])
                    / (len(d2_centered) * d2_var)
                )
            else:
                autocorr_2nd = 0.0
        else:
            var_2nd = 0.0
            entropy_2nd = 0.0
            autocorr_2nd = 0.0

        return np.array(
            [
                mean_s,
                std_s,
                var_s,
                skew_s,
                kurt_s,
                mean_diff,
                std_diff,
                var_2nd,
                entropy_2nd,
                autocorr_2nd,
            ],
            dtype=np.float64,
        )
