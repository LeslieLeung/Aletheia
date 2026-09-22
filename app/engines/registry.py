from __future__ import annotations

from app.engines.base import DecisionEngine, EngineUnavailable


class DecisionEngineRegistry:
    """Name → engine. ``POST /detect`` looks engines up here."""

    def __init__(self) -> None:
        self._engines: dict[str, DecisionEngine] = {}

    def register(self, engine: DecisionEngine) -> None:
        self._engines[engine.name] = engine

    def has(self, name: str) -> bool:
        return name in self._engines

    def get(self, name: str) -> DecisionEngine:
        engine = self._engines.get(name)
        if engine is None:
            raise EngineUnavailable(f"Unknown decision engine: {name}")
        return engine
