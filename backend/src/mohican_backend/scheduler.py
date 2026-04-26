from __future__ import annotations

import asyncio
from collections import defaultdict

from .artifacts import ArtifactStore
from .engines.base import EngineContext
from .engines.garak import GarakRunner
from .engines.promptfoo import PromptfooRunner
from .models import Engine, EngineResult, FeatureId, JobEvent, JobStatus, Summary
from .process_runner import ProcessRegistry
from .store import JobStore


class JobScheduler:
    def __init__(
        self,
        *,
        store: JobStore,
        artifacts: ArtifactStore,
        process_registry: ProcessRegistry,
        worker_count: int,
    ) -> None:
        self.store = store
        self.artifacts = artifacts
        self.process_registry = process_registry
        self.worker_count = worker_count
        self._tasks: list[asyncio.Task[None]] = []
        self._stopping = asyncio.Event()
        self._runners = {
            Engine.promptfoo: PromptfooRunner(),
            Engine.garak: GarakRunner(),
        }

    async def start(self) -> None:
        self._stopping.clear()
        self._tasks = [asyncio.create_task(self._worker(index)) for index in range(self.worker_count)]

    async def stop(self) -> None:
        self._stopping.set()
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []

    async def _worker(self, index: int) -> None:
        while not self._stopping.is_set():
            try:
                job_id = await self.store.claim()
            except asyncio.CancelledError:
                break
            try:
                await self._run_job(job_id, worker_index=index)
            finally:
                self.store.task_done()

    async def _run_job(self, job_id: str, *, worker_index: int) -> None:
        job = await self.store.get(job_id)
        if job is None:
            return
        await self.store.set_status(job_id, JobStatus.preparing, message=f"Worker {worker_index} claimed job")
        engine_features = _features_by_engine(job.request.selections)
        total_engines = len(engine_features)
        await self.store.set_status(job_id, JobStatus.preparing, completed=0, total=total_engines)

        engine_results: list[EngineResult] = []
        for completed, (engine, feature_ids) in enumerate(engine_features.items(), start=1):
            if job.cancel_event.is_set():
                engine_results.append(
                    EngineResult(engine=engine, status="cancelled", summary=Summary())
                )
                break
            if engine == Engine.custom_suite:
                await self.store.set_engine_status(job_id, engine, "skipped", error="custom-suite runner is not implemented")
                engine_results.append(
                    EngineResult(
                        engine=engine,
                        status="skipped",
                        summary=Summary(),
                        error="custom-suite runner is not implemented",
                    )
                )
                continue

            runner = self._runners[engine]
            engine_dir = self.artifacts.engine_dir(job_id, engine.value)
            await self.store.set_engine_status(job_id, engine, "running")
            await self.store.set_status(job_id, JobStatus.running, completed=completed - 1, total=total_engines)

            async def emit(event: JobEvent) -> None:
                await self.store.emit(job_id, event)

            try:
                result = await runner.run(
                    EngineContext(
                        job_id=job_id,
                        request=job.request,
                        feature_ids=feature_ids,
                        workdir=engine_dir,
                        artifacts=self.artifacts,
                        process_registry=self.process_registry,
                        cancel_event=job.cancel_event,
                        emit=emit,
                    )
                )
            except asyncio.CancelledError:
                result = EngineResult(engine=engine, status="cancelled", summary=Summary())
            except Exception as exc:
                result = EngineResult(
                    engine=engine,
                    status="failed",
                    summary=Summary(total=1, errors=1, riskScore=1.0),
                    error=str(exc),
                )

            engine_results.append(result)
            await self.store.set_engine_status(job_id, engine, result.status, error=result.error)
            await self.store.set_status(job_id, JobStatus.running, completed=completed, total=total_engines)

        await self.store.set_status(job_id, JobStatus.parsing, completed=total_engines, total=total_engines)
        await self.store.complete(job_id, engine_results)

    async def cancel(self, job_id: str) -> bool:
        cancelled = await self.store.cancel(job_id)
        if cancelled:
            await self.process_registry.cancel(job_id)
        return cancelled


def _features_by_engine(selections) -> dict[Engine, list[FeatureId]]:
    mapping: dict[Engine, list[FeatureId]] = defaultdict(list)
    for selection in selections:
        for engine in selection.engines:
            if selection.feature_id not in mapping[engine]:
                mapping[engine].append(selection.feature_id)
    return dict(mapping)

