from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.responses import FileResponse

from app.lang_detect import detect_language
from app.models import ModelManager
from app.schemas import DetectRequest, DetectResponse

_STATIC_DIR = Path(__file__).resolve().parent / "static"

manager = ModelManager()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    manager.load_defaults()
    yield


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


@app.post("/detect")
async def detect(req: DetectRequest) -> DetectResponse:
    lang = req.lang if req.lang else detect_language(req.text)
    model_id = manager.resolve_model_id(lang, req.model_id)
    label, score, num_chunks = manager.predict(
        req.text, model_id, req.strategy, req.early_stop
    )
    return DetectResponse(
        label=label,
        score=score,
        model_id=model_id,
        detected_lang=lang,
        num_chunks=num_chunks,
    )
