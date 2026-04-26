from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .artifacts import ArtifactStore
from .models import (
    Engine,
    EngineResult,
    JobEvent,
    JobRequest,
    JobSnapshot,
    JobStatus,
    NormalizedResult,
    Progress,
    Summary,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RuntimeJob:
    job_id: str
    request: JobRequest
    status: JobStatus = JobStatus.queued
    progress: Progress = field(default_factory=lambda: Progress(phase=JobStatus.queued))
    engine_states: dict[Engine, dict[str, Any]] = field(default_factory=dict)
    created_at: str = field(default_factory=now_iso)
    updated_at: str = field(default_factory=now_iso)
    result: NormalizedResult | None = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)


class JobStore:
    def __init__(self, artifacts: ArtifactStore):
        self.artifacts = artifacts
        self._jobs: dict[str, RuntimeJob] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._lock = asyncio.Lock()

    async def create(self, request: JobRequest) -> RuntimeJob:
        job_id = "job_" + uuid.uuid4().hex[:12]
        job = RuntimeJob(job_id=job_id, request=request)
        engines = sorted(
            {engine for selection in request.selections for engine in selection.engines},
            key=lambda engine: engine.value,
        )
        job.engine_states = {
            engine: {"engine": engine.value, "status": JobStatus.queued.value}
            for engine in engines
        }
        async with self._lock:
            self._jobs[job_id] = job
        self.artifacts.write_json(job_id, "request.json", request.model_dump(by_alias=True, mode="json"))
        await self.emit(job_id, JobEvent.make("status", message="Job queued", data={"status": "queued"}))
        await self._queue.put(job_id)
        return job

    async def claim(self) -> str:
        return await self._queue.get()

    def task_done(self) -> None:
        self._queue.task_done()

    async def get(self, job_id: str) -> RuntimeJob | None:
        async with self._lock:
            return self._jobs.get(job_id)

    async def snapshot(self, job_id: str) -> JobSnapshot | None:
        job = await self.get(job_id)
        if not job:
            return None
        return JobSnapshot(
            jobId=job.job_id,
            status=job.status,
            progress=job.progress,
            engines=list(job.engine_states.values()),
            createdAt=job.created_at,
            updatedAt=job.updated_at,
            resultAvailable=job.result is not None,
        )

    async def set_status(
        self,
        job_id: str,
        status: JobStatus,
        *,
        completed: int | None = None,
        total: int | None = None,
        message: str | None = None,
    ) -> None:
        async with self._lock:
            job = self._jobs[job_id]
            job.status = status
            job.updated_at = now_iso()
            job.progress = Progress(
                phase=status,
                completed=job.progress.completed if completed is None else completed,
                total=job.progress.total if total is None else total,
            )
        await self.emit(job_id, JobEvent.make("status", message=message, data={"status": status.value}))

    async def set_engine_status(
        self,
        job_id: str,
        engine: Engine,
        status: str,
        *,
        error: str | None = None,
    ) -> None:
        async with self._lock:
            job = self._jobs[job_id]
            state = job.engine_states.setdefault(engine, {"engine": engine.value})
            state["status"] = status
            if error:
                state["error"] = error
            job.updated_at = now_iso()
        await self.emit(
            job_id,
            JobEvent.make(
                "engine-status",
                engine=engine,
                message=f"{engine.value} {status}",
                data={"status": status, **({"error": error} if error else {})},
            ),
        )

    async def complete(self, job_id: str, engine_results: list[EngineResult]) -> NormalizedResult:
        findings = [finding for result in engine_results for finding in result.findings]
        artifacts = [artifact for result in engine_results for artifact in result.artifacts]
        summary = merge_summaries([result.summary for result in engine_results])
        status = JobStatus.completed
        if any(result.status == "failed" for result in engine_results):
            status = JobStatus.failed
        if any(result.status == "cancelled" for result in engine_results):
            status = JobStatus.cancelled
        result = NormalizedResult(
            jobId=job_id,
            status=status,
            summary=summary,
            engineResults=engine_results,
            findings=findings,
            artifacts=artifacts,
        )
        async with self._lock:
            job = self._jobs[job_id]
            job.status = status
            job.result = result
            job.updated_at = now_iso()
            job.progress = Progress(phase=status, completed=summary.total, total=summary.total)
        self.artifacts.write_json(job_id, "normalized-result.json", result.model_dump(by_alias=True, mode="json"))
        await self.emit(job_id, JobEvent.make("status", message=f"Job {status.value}", data={"status": status.value}))
        return result

    async def cancel(self, job_id: str) -> bool:
        job = await self.get(job_id)
        if not job:
            return False
        job.cancel_event.set()
        await self.set_status(job_id, JobStatus.cancelled, message="Cancellation requested")
        return True

    async def emit(self, job_id: str, event: JobEvent) -> None:
        self.artifacts.append_jsonl(job_id, "events.jsonl", event.model_dump(mode="json"))

    def event_path(self, job_id: str) -> Path:
        return self.artifacts.job_dir(job_id) / "events.jsonl"


def merge_summaries(summaries: list[Summary]) -> Summary:
    total = sum(summary.total for summary in summaries)
    passed = sum(summary.passed for summary in summaries)
    failed = sum(summary.failed for summary in summaries)
    errors = sum(summary.errors for summary in summaries)
    risk_score = 0.0 if total == 0 else min(1.0, (failed + errors) / total)
    return Summary(total=total, passed=passed, failed=failed, errors=errors, riskScore=risk_score)
