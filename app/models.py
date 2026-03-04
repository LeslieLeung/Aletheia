"""Backward-compatible re-export."""

from app.detectors.onnx_classifier import OnnxClassifierDetector as ModelManager

__all__ = ["ModelManager"]
