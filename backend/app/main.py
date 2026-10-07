from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import cases, drafting

app = FastAPI(title="RTI Copilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cases.router)
app.include_router(drafting.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
