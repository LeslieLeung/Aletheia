"""Jev decision engine.

Renders the shared question specs into TypeSafe SDK types. Another engine
keeps those specs and implements ``DecisionEngine`` the same way.
"""

from __future__ import annotations

import logging
import threading

from typesafe_sdk import Choice, Noul, TypeSafeClient, TypeSafeError

from app.engines.base import ContentJudgment, EngineUnavailable, JudgeResult, ai_from_noul
from app.engines.questions import AI_GENERATED, CONTENT_TYPE

logger = logging.getLogger(__name__)

JEV_TEXT_BUDGET = 6000
JEV_TIMEOUT_SECONDS = 30.0


class JevEngine:
    """TypeSafe Jev. The API key is read from ``TYPESAFE_API_KEY``."""

    name = "jev"
    text_budget = JEV_TEXT_BUDGET

    def __init__(self) -> None:
        self._client: TypeSafeClient | None = None
        self._client_lock = threading.Lock()

    def judge(
        self,
        state: dict[str, str],
        *,
        include_ai: bool,
        include_content: bool,
    ) -> JudgeResult:
        if not include_ai and not include_content:
            raise ValueError("judge requires include_ai or include_content")

        questions: dict[str, Noul | Choice] = {}
        if include_ai:
            questions[AI_GENERATED.id] = Noul(
                instructions=AI_GENERATED.instructions,
                criteria={"true": AI_GENERATED.true, "false": AI_GENERATED.false},
            )
        if include_content:
            questions[CONTENT_TYPE.id] = Choice(
                instructions=CONTENT_TYPE.instructions,
                criteria=CONTENT_TYPE.criteria,
            )

        try:
            response = self._get_client().system_one(state=state, questions=questions)
        except TypeSafeError as exc:
            logger.warning("Jev request failed: %s", exc)
            raise EngineUnavailable(str(exc)) from exc

        ai = None
        if include_ai:
            noul = response.nouls.get(AI_GENERATED.id)
            if noul is None:
                raise EngineUnavailable("Jev response did not include an AI judgment")
            ai = ai_from_noul(float(noul.noul))

        content = None
        if include_content:
            choice = response.choices.get(CONTENT_TYPE.id)
            if choice is None:
                raise EngineUnavailable("Jev response did not include a content judgment")
            content = ContentJudgment(
                label=choice.choice,
                confidence=float(choice.confidence),
                probabilities={key: float(value) for key, value in choice.probabilities.items()},
            )

        return JudgeResult(model_id=response.model, ai=ai, content=content)

    def _get_client(self) -> TypeSafeClient:
        if self._client is not None:
            return self._client
        with self._client_lock:
            if self._client is None:
                try:
                    self._client = TypeSafeClient(timeout=JEV_TIMEOUT_SECONDS)
                except TypeSafeError as exc:
                    logger.warning("Jev client is unavailable: %s", exc)
                    raise EngineUnavailable(str(exc)) from exc
        return self._client
