from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import Artifact


class ArtifactStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def job_dir(self, job_id: str) -> Path:
        path = self.root / job_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def engine_dir(self, job_id: str, engine: str) -> Path:
        path = self.job_dir(job_id) / "engine" / engine
        path.mkdir(parents=True, exist_ok=True)
        return path

    def write_json(self, job_id: str, name: str, data: Any) -> Path:
        path = self.job_dir(job_id) / name
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return path

    def append_jsonl(self, job_id: str, name: str, data: Any) -> Path:
        path = self.job_dir(job_id) / name
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(data, ensure_ascii=False) + "\n")
        return path

    def read_json(self, job_id: str, name: str) -> Any | None:
        path = self.job_dir(job_id) / name
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def artifact(self, job_id: str, path: Path, artifact_type: str) -> Artifact:
        try:
            relative = path.relative_to(self.job_dir(job_id))
        except ValueError:
            relative = path
        return Artifact(name=path.name, path=str(relative), type=artifact_type)

