from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from typing import Protocol

from app.schemas import Strategy

logger = logging.getLogger(__name__)

MODEL_TTL_SECONDS = int(os.environ.get("MODEL_TTL_SECONDS", "1800"))


class Detector(Protocol):
    def resolve_model_id(self, lang: str, model_id: str | None) -> str: ...
    def predict(
        self,
        text: str,
        model_id: str,
        strategy: Strategy,
        early_stop: bool,
    ) -> tuple[str, float, int]: ...
    def unload(self) -> None: ...


class _DetectorEntry:
    __slots__ = ("detector", "last_used_at", "lock")

    def __init__(self, detector: Detector) -> None:
        self.detector = detector
        self.last_used_at: float = 0.0
        self.lock = threading.Lock()

    def touch(self) -> None:
        self.last_used_at = time.monotonic()


class DetectorRegistry:
    def __init__(self) -> None:
        self._entries: dict[str, _DetectorEntry] = {}
        self._default: str | None = None
        self._ttl_task: asyncio.Task[None] | None = None

    def register(self, name: str, detector: Detector, *, default: bool = False) -> None:
        self._entries[name] = _DetectorEntry(detector)
        if default:
            self._default = name

    def get(self, name: str | None) -> tuple[str, Detector]:
        key = name or self._default
        if key is None:
            raise ValueError("No detector specified and no default registered")
        entry = self._entries.get(key)
        if entry is None:
            raise ValueError(f"Unknown detector: {key}")
        return key, entry.detector

    def predict(
        self,
        name: str | None,
        text: str,
        model_id: str,
        strategy: Strategy,
        early_stop: bool,
    ) -> tuple[str, str, float, int]:
        """Proxy predict that tracks usage. Returns (detector_name, label, score, num_chunks)."""
        key = name or self._default
        if key is None:
            raise ValueError("No detector specified and no default registered")
        entry = self._entries.get(key)
        if entry is None:
            raise ValueError(f"Unknown detector: {key}")
        with entry.lock:
            entry.touch()
            label, score, num_chunks = entry.detector.predict(
                text, model_id, strategy, early_stop
            )
        return key, label, score, num_chunks

    # ------------------------------------------------------------------
    # TTL management
    # ------------------------------------------------------------------

    def start_ttl_task(self, loop: asyncio.AbstractEventLoop | None = None) -> None:
        if MODEL_TTL_SECONDS <= 0:
            logger.info("Model TTL disabled (MODEL_TTL_SECONDS=%d)", MODEL_TTL_SECONDS)
            return
        interval = max(MODEL_TTL_SECONDS // 2, 10)
        logger.info(
            "Model TTL enabled: %ds, scan interval: %ds", MODEL_TTL_SECONDS, interval
        )
        self._ttl_task = asyncio.create_task(self._ttl_loop(interval))

    def stop_ttl_task(self) -> None:
        if self._ttl_task is not None:
            self._ttl_task.cancel()
            self._ttl_task = None

    async def _ttl_loop(self, interval: int) -> None:
        while True:
            await asyncio.sleep(interval)
            now = time.monotonic()
            for name, entry in list(self._entries.items()):
                if entry.last_used_at == 0.0:
                    continue
                if now - entry.last_used_at > MODEL_TTL_SECONDS:
                    logger.info("TTL expired for detector %s, unloading …", name)
                    with entry.lock:
                        entry.detector.unload()
                        entry.last_used_at = 0.0
