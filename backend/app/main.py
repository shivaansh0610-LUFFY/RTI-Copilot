import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import cases, drafting, geocode, responses
from app.services import embeddings


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if settings.use_corpus_citations and settings.use_llm_drafting:
        # Loading the embedding model takes a while; do it now, off the request path.
        threading.Thread(target=embeddings.warm_up, name="embedding-warm-up", daemon=True).start()
    yield


app = FastAPI(title="RTI Copilot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cases.router)
app.include_router(drafting.router)
app.include_router(geocode.router)
app.include_router(responses.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
