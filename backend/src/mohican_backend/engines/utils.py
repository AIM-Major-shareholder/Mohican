from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from mohican_backend.models import RequestMode, TargetConfig


def target_endpoint(target: TargetConfig) -> str:
    base = target.base_url.rstrip("/")
    if target.request_mode == RequestMode.chat:
        return base if base.endswith("/chat") else f"{base}/chat"
    return base if base.endswith("/generate") else f"{base}/generate"


def command_path(configured: str) -> str | None:
    if os.path.isabs(configured) and Path(configured).exists():
        return configured
    found = shutil.which(configured)
    if found:
        return found
    return None


def dedupe(values: list[str] | tuple[str, ...]) -> list[str]:
    return list(dict.fromkeys(values))


def ollama_generation_controls() -> dict[str, Any]:
    return {
        "think": False,
        "options": {
            "num_predict": 256,
            "temperature": 0,
        },
    }
