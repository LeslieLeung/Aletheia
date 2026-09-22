import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from app.detector import DetectorRegistry
from app.detectors.diveye import DivEyeDetector
from app.detectors.onnx_classifier import OnnxClassifierDetector
from app.engines.base import EngineUnavailable, JudgeResult, build_state
from app.engines.jev import JevEngine
from app.engines.registry import DecisionEngineRegistry
from app.lang_detect import detect_language
from app.schemas import ContentJudgmentResponse, DetectRequest, DetectResponse

_STATIC_DIR = Path(__file__).resolve().parent / "static"

registry = DetectorRegistry()
registry.register("onnx_classifier", OnnxClassifierDetector(), default=True)
registry.register("diveye", DivEyeDetector())

decisions = DecisionEngineRegistry()
decisions.register(JevEngine())


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    registry.start_ttl_task()
    yield
    registry.stop_ttl_task()


app = FastAPI(
    title="Aletheia – AIGC Text Detector API",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/", response_class=FileResponse, include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(_STATIC_DIR / "index.html", media_type="text/html")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _content_response(engine_name: str, result: JudgeResult) -> ContentJudgmentResponse:
    if result.content is None:
        raise EngineUnavailable("Decision engine did not return a content judgment")
    return ContentJudgmentResponse(
        engine=engine_name,
        model_id=result.model_id,
        label=result.content.label,
        confidence=result.content.confidence,
        probabilities=result.content.probabilities,
    )


@app.post("/detect", response_model_exclude_none=True)
async def detect(req: DetectRequest) -> DetectResponse:
    try:
        return await _detect(req)
    except EngineUnavailable as exc:
        raise HTTPException(status_code=503, detail=exc.detail) from exc


async def _detect(req: DetectRequest) -> DetectResponse:
    lang = req.lang if req.lang else detect_language(req.text)
    requested = req.detector.value if req.detector else None
    content_name = req.content_engine.value if req.content_engine else None
    ai_engine_name = requested if requested is not None and decisions.has(requested) else None
    same_engine = ai_engine_name is not None and content_name == ai_engine_name

    content: ContentJudgmentResponse | None = None

    if same_engine:
        assert ai_engine_name is not None
        engine = decisions.get(ai_engine_name)
        result = await asyncio.to_thread(
            engine.judge,
            build_state(
                text=req.text,
                title=req.title,
                url=req.url,
                text_budget=engine.text_budget,
            ),
            include_ai=True,
            include_content=True,
        )
        if result.ai is None:
            raise EngineUnavailable("Decision engine did not return an AI judgment")
        return DetectResponse(
            label=result.ai.label,
            score=result.ai.score,
            model_id=result.model_id,
            detected_lang=lang,
            num_chunks=1,
            detector=ai_engine_name,
            content=_content_response(ai_engine_name, result),
        )

    if ai_engine_name is not None:
        engine = decisions.get(ai_engine_name)
        result = await asyncio.to_thread(
            engine.judge,
            build_state(
                text=req.text,
                title=req.title,
                url=req.url,
                text_budget=engine.text_budget,
            ),
            include_ai=True,
            include_content=False,
        )
        if result.ai is None:
            raise EngineUnavailable("Decision engine did not return an AI judgment")
        label = result.ai.label
        score = result.ai.score
        model_id = result.model_id
        num_chunks = 1
        detector_key = ai_engine_name
    else:
        detector_name, detector = registry.get(requested)
        model_id = detector.resolve_model_id(lang, req.model_id)
        detector_key, label, score, num_chunks = registry.predict(
            detector_name, req.text, model_id, req.strategy, req.early_stop
        )

    if content_name is not None:
        engine = decisions.get(content_name)
        result = await asyncio.to_thread(
            engine.judge,
            build_state(
                text=req.text,
                title=req.title,
                url=req.url,
                text_budget=engine.text_budget,
            ),
            include_ai=False,
            include_content=True,
        )
        content = _content_response(content_name, result)

    return DetectResponse(
        label=label,
        score=score,
        model_id=model_id,
        detected_lang=lang,
        num_chunks=num_chunks,
        detector=detector_key,
        content=content,
    )
