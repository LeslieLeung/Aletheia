"""Shared types for decision engines.

A new engine implements ``DecisionEngine`` and is registered by name. The
request and response shapes do not change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class EngineUnavailable(Exception):
    """The engine cannot answer (missing credentials, unknown name, or upstream failure)."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


@dataclass(frozen=True)
class AiJudgment:
    label: str
    score: float


@dataclass(frozen=True)
class ContentJudgment:
    label: str
    confidence: float
    probabilities: dict[str, float]


@dataclass(frozen=True)
class JudgeResult:
    model_id: str
    ai: AiJudgment | None = None
    content: ContentJudgment | None = None


class DecisionEngine(Protocol):
    """Typed judgments over one piece of page state.

    ``judge`` may answer the AI question, the content question, or both in
    one call. ``text_budget`` is the maximum number of characters of article
    text placed in the state.
    """

    name: str
    text_budget: int

    def judge(
        self,
        state: dict[str, str],
        *,
        include_ai: bool,
        include_content: bool,
    ) -> JudgeResult: ...


def ai_from_noul(probability: float) -> AiJudgment:
    """Map P(AI-generated) onto the existing human/ai score.

    ``score`` is the probability of the chosen label, matching the ONNX and
    DivEye detectors.
    """
    if probability >= 0.5:
        return AiJudgment(label="ai", score=probability)
    return AiJudgment(label="human", score=1.0 - probability)


def build_state(
    *,
    text: str,
    title: str | None,
    url: str | None,
    text_budget: int,
) -> dict[str, str]:
    """Build the state every engine receives. Blank title and URL are omitted."""
    state: dict[str, str] = {"text": text[:text_budget]}
    if title and title.strip():
        state["title"] = title.strip()
    if url and url.strip():
        state["url"] = url.strip()
    return state
