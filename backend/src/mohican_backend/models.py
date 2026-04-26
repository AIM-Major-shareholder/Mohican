from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Engine(str, Enum):
    promptfoo = "promptfoo"
    garak = "garak"
    custom_suite = "custom-suite"


class FeatureId(str, Enum):
    prompt_injection = "prompt-injection"
    indirect_injection = "indirect-injection"
    jailbreak = "jailbreak"
    tool_abuse = "tool-abuse"


class RequestMode(str, Enum):
    chat = "chat"
    generate = "generate"


class JobStatus(str, Enum):
    queued = "queued"
    preparing = "preparing"
    generating = "generating"
    running = "running"
    parsing = "parsing"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class Severity(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    info = "info"


class TargetConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    base_url: str = Field(alias="baseUrl")
    api_key: str = Field(default="", alias="apiKey")
    model: str
    request_mode: RequestMode = Field(alias="requestMode")

    @field_validator("base_url", "model")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class Selection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    feature_id: FeatureId = Field(alias="featureId")
    engines: list[Engine]

    @field_validator("engines")
    @classmethod
    def _dedupe_engines(cls, value: list[Engine]) -> list[Engine]:
        deduped = list(dict.fromkeys(value))
        if not deduped:
            raise ValueError("at least one engine is required")
        return deduped


class RunOptions(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    num_tests: int = Field(default=5, alias="numTests", ge=1, le=200)
    max_concurrency: int = Field(default=4, alias="maxConcurrency", ge=1, le=32)
    timeout_seconds: int = Field(default=900, alias="timeoutSeconds", ge=30, le=86400)
    engine_timeout_seconds: int = Field(default=900, alias="engineTimeoutSeconds", ge=30, le=86400)
    dry_run: bool = Field(default=False, alias="dryRun")


class JobRequest(BaseModel):
    target: TargetConfig
    selections: list[Selection]
    run_options: RunOptions = Field(default_factory=RunOptions, alias="runOptions")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("selections")
    @classmethod
    def _non_empty_selections(cls, value: list[Selection]) -> list[Selection]:
        if not value:
            raise ValueError("at least one selection is required")
        return value


class Progress(BaseModel):
    phase: JobStatus
    completed: int = 0
    total: int = 0


class Artifact(BaseModel):
    name: str
    path: str
    type: str


class Finding(BaseModel):
    id: str
    engine: Engine
    category: str
    severity: Severity
    passed: bool
    feature_id: str | None = Field(default=None, alias="featureId")
    probe: str | None = None
    plugin: str | None = None
    strategy: str | None = None
    buff: str | None = None
    detector: str | None = None
    score: float | None = None
    payload: str | None = None
    response: str | None = None
    evidence: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class Summary(BaseModel):
    total: int = 0
    passed: int = 0
    failed: int = 0
    errors: int = 0
    risk_score: float = Field(default=0.0, alias="riskScore")

    model_config = ConfigDict(populate_by_name=True)


class EngineResult(BaseModel):
    engine: Engine
    status: Literal["completed", "failed", "skipped", "cancelled"]
    summary: Summary = Field(default_factory=Summary)
    findings: list[Finding] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    error: str | None = None


class NormalizedResult(BaseModel):
    job_id: str = Field(alias="jobId")
    status: JobStatus
    summary: Summary
    engine_results: list[EngineResult] = Field(alias="engineResults")
    findings: list[Finding]
    artifacts: list[Artifact]

    model_config = ConfigDict(populate_by_name=True)


class JobEvent(BaseModel):
    timestamp: str
    type: str
    message: str | None = None
    engine: Engine | None = None
    stream: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def make(
        cls,
        event_type: str,
        *,
        message: str | None = None,
        engine: Engine | None = None,
        stream: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> "JobEvent":
        return cls(
            timestamp=datetime.now(timezone.utc).isoformat(),
            type=event_type,
            message=message,
            engine=engine,
            stream=stream,
            data=data or {},
        )


class JobSnapshot(BaseModel):
    job_id: str = Field(alias="jobId")
    status: JobStatus
    progress: Progress
    engines: list[dict[str, Any]]
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    result_available: bool = Field(alias="resultAvailable")

    model_config = ConfigDict(populate_by_name=True)

