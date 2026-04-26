from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _external_tool_path(root: Path, name: str) -> Path:
    direct = root / name
    parent = root.parent / name
    if direct.exists() or not parent.exists():
        return direct
    return parent


@dataclass(frozen=True)
class Settings:
    storage_dir: Path
    promptfoo_bin: str
    promptfoo_repo: Path
    promptfoo_config_dir: Path
    garak_repo: Path
    max_workers: int
    cors_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "Settings":
        root = _repo_root()
        storage_dir = Path(os.environ.get("MOHICAN_STORAGE_DIR", root / ".mohican" / "jobs"))
        cors_origins = tuple(
            item.strip()
            for item in os.environ.get(
                "MOHICAN_CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if item.strip()
        )
        return cls(
            storage_dir=storage_dir,
            promptfoo_bin=os.environ.get("MOHICAN_PROMPTFOO_BIN", "promptfoo"),
            promptfoo_repo=Path(
                os.environ.get("MOHICAN_PROMPTFOO_REPO", _external_tool_path(root, "promptfoo"))
            ),
            promptfoo_config_dir=Path(
                os.environ.get("MOHICAN_PROMPTFOO_CONFIG_DIR", root / ".promptfoo")
            ),
            garak_repo=Path(os.environ.get("MOHICAN_GARAK_REPO", _external_tool_path(root, "garak"))),
            max_workers=max(1, int(os.environ.get("MOHICAN_MAX_WORKERS", "2"))),
            cors_origins=cors_origins,
        )


settings = Settings.from_env()
