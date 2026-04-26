from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from mohican_backend.artifacts import ArtifactStore
from mohican_backend.models import Engine, EngineResult, FeatureId, JobEvent, JobRequest
from mohican_backend.process_runner import ProcessRegistry


EmitEvent = Callable[[JobEvent], Awaitable[None]]


@dataclass
class EngineContext:
    job_id: str
    request: JobRequest
    feature_ids: list[FeatureId]
    workdir: Path
    artifacts: ArtifactStore
    process_registry: ProcessRegistry
    cancel_event: object
    emit: EmitEvent


class EngineRunner(ABC):
    engine: Engine

    @abstractmethod
    async def run(self, context: EngineContext) -> EngineResult:
        ...

