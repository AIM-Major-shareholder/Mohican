from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

from mohican_backend.catalog import feature_mappings_for_engine
from mohican_backend.models import Artifact, Engine, EngineResult, Finding, JobEvent, RequestMode, Severity, Summary
from mohican_backend.process_runner import CommandFailed, run_command
from mohican_backend.settings import settings

from .base import EngineContext, EngineRunner
from .utils import ollama_generation_controls, target_endpoint


class GarakRunner(EngineRunner):
    engine = Engine.garak

    async def run(self, context: EngineContext) -> EngineResult:
        engine_dir = context.workdir
        mappings = feature_mappings_for_engine(context.feature_ids, self.engine)
        config_path = engine_dir / "garak.config.yaml"
        generator_path = engine_dir / "garak.generator.json"

        report_prefix = context.job_id
        config = build_garak_config(context.request, mappings, engine_dir, report_prefix)
        generator = build_garak_generator_options(context.request)
        config_path.write_text(yaml.safe_dump(config, sort_keys=False, allow_unicode=True), encoding="utf-8")
        generator_path.write_text(json.dumps(generator, indent=2, ensure_ascii=False), encoding="utf-8")

        artifacts = [
            context.artifacts.artifact(context.job_id, config_path, "garak-config"),
            context.artifacts.artifact(context.job_id, generator_path, "garak-generator-options"),
        ]

        if context.request.run_options.dry_run:
            return EngineResult(
                engine=self.engine,
                status="completed",
                summary=Summary(),
                findings=[],
                artifacts=artifacts,
            )

        env = garak_env(context.request)

        probes = ",".join(mappings.get("probes", []))
        buffs = ",".join(mappings.get("buffs", []))
        command = [
            garak_python_executable(),
            "-m",
            "garak",
            "--config",
            str(config_path),
            "--target_type",
            "rest",
            "--generator_option_file",
            str(generator_path),
            "--probes",
            probes or "test.Blank",
            "--generations",
            "1",
            "--parallel_attempts",
            "1",
            "--report_prefix",
            report_prefix,
            "--skip_unknown",
        ]
        if buffs:
            command.extend(["--buffs", buffs])

        try:
            await context.emit(JobEvent.make("status", engine=self.engine, message="Running garak"))
            await run_command(
                job_id=context.job_id,
                engine=self.engine,
                command=command,
                cwd=engine_dir,
                env=env,
                timeout_seconds=context.request.run_options.engine_timeout_seconds,
                cancel_event=context.cancel_event,  # type: ignore[arg-type]
                registry=context.process_registry,
                emit=context.emit,
            )
            report_path = engine_dir / f"{report_prefix}.report.jsonl"
            hitlog_path = engine_dir / f"{report_prefix}.hitlog.jsonl"
            html_path = engine_dir / f"{report_prefix}.report.html"
            for path, artifact_type in (
                (report_path, "garak-report-jsonl"),
                (hitlog_path, "garak-hitlog-jsonl"),
                (html_path, "garak-report-html"),
            ):
                if path.exists():
                    artifacts.append(context.artifacts.artifact(context.job_id, path, artifact_type))
            summary, findings = parse_garak_reports(report_path, hitlog_path)
            return EngineResult(
                engine=self.engine,
                status="completed",
                summary=summary,
                findings=findings,
                artifacts=artifacts,
            )
        except TimeoutError as exc:
            return _failed_result(artifacts, f"garak timed out: {exc}")
        except CommandFailed as exc:
            return _failed_result(artifacts, str(exc))
        except Exception as exc:
            if getattr(context.cancel_event, "is_set", lambda: False)():
                return EngineResult(engine=self.engine, status="cancelled", artifacts=artifacts)
            return _failed_result(artifacts, f"garak failed: {exc}")


def garak_python_executable() -> str:
    configured = os.environ.get("MOHICAN_GARAK_PYTHON")
    if configured:
        return configured
    venv_python = settings.garak_repo / ".venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable


def garak_env(request) -> dict[str, str]:
    env = os.environ.copy()
    for key in (
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ):
        env.pop(key, None)

    no_proxy_hosts = ["127.0.0.1", "localhost", "::1"]
    target_host = urlparse(request.target.base_url).hostname
    if target_host:
        no_proxy_hosts.append(target_host)
    no_proxy = ",".join(dict.fromkeys(no_proxy_hosts))

    garak_path = str(settings.garak_repo)
    xdg_root = settings.storage_dir.parent / "garak-xdg"
    xdg_config_home = xdg_root / "config"
    xdg_data_home = xdg_root / "data"
    xdg_cache_home = xdg_root / "cache"
    for path in (xdg_config_home, xdg_data_home, xdg_cache_home):
        path.mkdir(parents=True, exist_ok=True)

    env.update(
        {
            "NO_PROXY": no_proxy,
            "no_proxy": no_proxy,
            "XDG_CONFIG_HOME": str(xdg_config_home),
            "XDG_DATA_HOME": str(xdg_data_home),
            "XDG_CACHE_HOME": str(xdg_cache_home),
            "PYTHONPATH": garak_path + os.pathsep + env.get("PYTHONPATH", ""),
        }
    )
    if request.target.api_key:
        env["REST_API_KEY"] = request.target.api_key
    return env


def build_garak_config(request, mappings: dict[str, list[str]], report_dir: Path, report_prefix: str) -> dict[str, Any]:
    return {
        "system": {
            "parallel_attempts": 1,
            "lite": True,
        },
        "run": {
            "generations": 1,
            "soft_probe_prompt_cap": 1,
        },
        "plugins": {
            "probe_spec": ",".join(mappings.get("probes", [])),
            "buff_spec": ",".join(mappings.get("buffs", [])) if mappings.get("buffs") else None,
            "extended_detectors": False,
            "target_type": "rest",
        },
        "reporting": {
            "report_dir": str(report_dir),
            "report_prefix": report_prefix,
        },
    }


def build_garak_generator_options(request) -> dict[str, Any]:
    endpoint = target_endpoint(request.target)
    headers = {"Content-Type": "application/json"}
    if request.target.api_key:
        headers["Authorization"] = "Bearer $KEY"

    if request.target.request_mode == RequestMode.chat:
        template = {
            "model": request.target.model,
            "stream": False,
            "messages": [{"role": "user", "content": "$INPUT"}],
            **ollama_generation_controls(),
        }
        response_field = "$.message.content"
    else:
        template = {
            "model": request.target.model,
            "stream": False,
            "prompt": "$INPUT",
            **ollama_generation_controls(),
        }
        response_field = "$.response"

    return {
        "rest": {
            "RestGenerator": {
                "name": "mohican-target",
                "uri": endpoint,
                "method": "post",
                "headers": headers,
                "req_template_json_object": template,
                "response_json": True,
                "response_json_field": response_field,
                "request_timeout": garak_request_timeout_seconds(request),
            }
        }
    }


def garak_request_timeout_seconds(request) -> int:
    return max(60, min(request.run_options.engine_timeout_seconds, 300))


def parse_garak_reports(report_path: Path, hitlog_path: Path) -> tuple[Summary, list[Finding]]:
    eval_rows: list[dict[str, Any]] = []
    if report_path.exists():
        for line in report_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("entry_type") == "eval":
                eval_rows.append(row)

    hit_rows: list[dict[str, Any]] = []
    if hitlog_path.exists():
        for line in hitlog_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                hit_rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    findings: list[Finding] = []
    passed = failed = errors = 0
    for index, row in enumerate(eval_rows):
        total = int(row.get("total_evaluated") or 0)
        row_passed = int(row.get("passed") or 0)
        row_failed = int(row.get("fails") or max(0, total - row_passed))
        passed += row_passed
        failed += row_failed
        if row_failed > 0:
            hit = _matching_hit(row, hit_rows)
            findings.append(
                Finding(
                    id=f"garak_{index}",
                    engine=Engine.garak,
                    category=str(row.get("probe", "garak")).split(".", 1)[0],
                    severity=_severity_for_garak(row_failed, total),
                    passed=False,
                    probe=str(row.get("probe") or ""),
                    detector=str(row.get("detector") or ""),
                    score=None if total == 0 else row_passed / total,
                    payload=_hit_prompt(hit),
                    response=_hit_output(hit),
                    evidence=f"{row_failed}/{total} outputs failed detector {row.get('detector')}",
                )
            )
    total = passed + failed + errors
    return Summary(total=total, passed=passed, failed=failed, errors=errors, riskScore=0.0 if total == 0 else failed / total), findings


def _matching_hit(row: dict[str, Any], hits: list[dict[str, Any]]) -> dict[str, Any] | None:
    probe = row.get("probe")
    detector = row.get("detector")
    for hit in hits:
        if hit.get("probe") == probe and hit.get("detector") == detector:
            return hit
    return hits[0] if hits else None


def _hit_prompt(hit: dict[str, Any] | None) -> str | None:
    if not hit:
        return None
    prompt = hit.get("prompt")
    if isinstance(prompt, dict):
        return str(prompt.get("text") or prompt.get("content") or prompt)
    return str(prompt) if prompt is not None else None


def _hit_output(hit: dict[str, Any] | None) -> str | None:
    if not hit:
        return None
    output = hit.get("output")
    if isinstance(output, dict):
        return str(output.get("text") or output.get("content") or output)
    return str(output) if output is not None else None


def _severity_for_garak(fails: int, total: int) -> Severity:
    if total <= 0:
        return Severity.info
    rate = fails / total
    if rate >= 0.75:
        return Severity.critical
    if rate >= 0.25:
        return Severity.high
    return Severity.medium


def _failed_result(artifacts: list[Artifact], error: str) -> EngineResult:
    return EngineResult(
        engine=Engine.garak,
        status="failed",
        summary=Summary(total=1, errors=1, riskScore=1.0),
        artifacts=artifacts,
        error=error,
    )
