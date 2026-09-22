"""Decision engines for typed page judgments.

To add an engine, implement ``DecisionEngine``, render the specs in
``app.engines.questions``, and register the instance in ``app.main``. Then
add its name to the ``detector`` and ``content_engine`` enums.
"""

from app.engines.base import DecisionEngine, EngineUnavailable, JudgeResult
from app.engines.registry import DecisionEngineRegistry

__all__ = [
    "DecisionEngine",
    "DecisionEngineRegistry",
    "EngineUnavailable",
    "JudgeResult",
]
