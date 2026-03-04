from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Strategy(str, Enum):
    TRUNCATE = "truncate"
    SLIDING_AVG = "sliding_avg"
    SLIDING_WEIGHTED_AVG = "sliding_weighted_avg"
    SLIDING_VOTE = "sliding_vote"


class DetectorType(str, Enum):
    ONNX_CLASSIFIER = "onnx_classifier"
    DIVEYE = "diveye"


class DetectRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to detect")
    lang: Optional[str] = Field(
        None,
        description='Language code. "zh" for Chinese model, anything else for English. '
        "Auto-detected if omitted.",
    )
    model_id: Optional[str] = Field(
        None,
        description="HuggingFace model ID to use instead of defaults. "
        "Takes precedence over lang.",
    )
    strategy: Strategy = Field(
        Strategy.TRUNCATE,
        description="Long text handling strategy: truncate, sliding_avg, sliding_weighted_avg, or sliding_vote",
    )
    early_stop: bool = Field(
        False,
        description="Stop early when confidence is high enough (only for sliding strategies)",
    )
    detector: Optional[DetectorType] = Field(
        None,
        description="Detector type: onnx_classifier or diveye. Defaults to onnx_classifier.",
    )


class DetectResponse(BaseModel):
    label: str = Field(..., description='Predicted label: "human" or "ai"')
    score: float = Field(..., description="Confidence probability")
    model_id: str = Field(..., description="Model used for prediction")
    detected_lang: str = Field(..., description="Detected or specified language")
    num_chunks: int = Field(..., description="Number of chunks processed")
    detector: str = Field(..., description="Detector type used")
