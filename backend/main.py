"""VeloSync backend entry point — API router wiring and server startup."""

import logging
from pathlib import Path
import sys

# Ensure the repo root is on sys.path so absolute imports work from any cwd.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import videos, routes, media

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="VeloSync backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers by domain
app.include_router(videos.router)
app.include_router(routes.router)
app.include_router(media.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
