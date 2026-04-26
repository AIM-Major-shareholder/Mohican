from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .artifacts import ArtifactStore
from .catalog import catalog_response
from .models import JobRequest
from .process_runner import ProcessRegistry
from .scheduler import JobScheduler
from .settings import settings
from .store import JobStore


artifacts = ArtifactStore(settings.storage_dir)
store = JobStore(artifacts)
process_registry = ProcessRegistry()
scheduler = JobScheduler(
    store=store,
    artifacts=artifacts,
    process_registry=process_registry,
    worker_count=settings.max_workers,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await scheduler.start()
    try:
        yield
    finally:
        await scheduler.stop()


app = FastAPI(title="Mohican Backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "storageDir": str(settings.storage_dir),
        "maxWorkers": settings.max_workers,
    }


@app.get("/api/catalog")
async def catalog() -> dict[str, object]:
    return catalog_response()


@app.post("/api/jobs")
async def create_job(request: JobRequest) -> dict[str, str]:
    job = await store.create(request)
    return {"jobId": job.job_id, "status": job.status.value}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str) -> JSONResponse:
    snapshot = await store.snapshot(job_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="job not found")
    return JSONResponse(snapshot.model_dump(by_alias=True, mode="json"))


@app.get("/api/jobs/{job_id}/result")
async def get_result(job_id: str) -> JSONResponse:
    job = await store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    if job.result is None:
        raise HTTPException(status_code=404, detail="result not available")
    return JSONResponse(job.result.model_dump(by_alias=True, mode="json"))


@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str) -> dict[str, str]:
    if not await scheduler.cancel(job_id):
        raise HTTPException(status_code=404, detail="job not found")
    return {"jobId": job_id, "status": "cancelled"}


@app.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str) -> StreamingResponse:
    job = await store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return StreamingResponse(_event_stream(job_id), media_type="text/event-stream")


async def _event_stream(job_id: str) -> AsyncIterator[str]:
    path = store.event_path(job_id)
    offset = 0
    while True:
        if path.exists():
            text = path.read_text(encoding="utf-8")
            if offset < len(text):
                chunk = text[offset:]
                offset = len(text)
                for line in chunk.splitlines():
                    if not line.strip():
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    event_type = event.get("type", "message")
                    yield f"event: {event_type}\n"
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        job = await store.get(job_id)
        if job is None or job.status.value in {"completed", "failed", "cancelled"}:
            break
        await asyncio.sleep(1)


def run() -> None:
    uvicorn.run("mohican_backend.main:app", host="0.0.0.0", port=8088, reload=False)


if __name__ == "__main__":
    run()

