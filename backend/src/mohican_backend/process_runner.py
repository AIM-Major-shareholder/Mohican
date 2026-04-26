from __future__ import annotations

import asyncio
import os
import signal
from pathlib import Path
from typing import Awaitable, Callable

from .models import Engine, JobEvent


EmitEvent = Callable[[JobEvent], Awaitable[None]]


class CommandFailed(RuntimeError):
    def __init__(self, command: list[str], returncode: int, stderr_tail: list[str] | None = None):
        detail = f"command failed with exit code {returncode}: {' '.join(command)}"
        if stderr_tail:
            detail = f"{detail}\nstderr:\n" + "\n".join(stderr_tail[-8:])
        super().__init__(detail)
        self.command = command
        self.returncode = returncode
        self.stderr_tail = stderr_tail or []


class ProcessRegistry:
    def __init__(self) -> None:
        self._processes: dict[str, list[asyncio.subprocess.Process]] = {}

    def add(self, job_id: str, process: asyncio.subprocess.Process) -> None:
        self._processes.setdefault(job_id, []).append(process)

    def remove(self, job_id: str, process: asyncio.subprocess.Process) -> None:
        processes = self._processes.get(job_id)
        if not processes:
            return
        if process in processes:
            processes.remove(process)
        if not processes:
            self._processes.pop(job_id, None)

    async def cancel(self, job_id: str) -> None:
        processes = list(self._processes.get(job_id, []))
        for process in processes:
            if process.returncode is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        await asyncio.sleep(2)
        for process in processes:
            if process.returncode is None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass


async def run_command(
    *,
    job_id: str,
    engine: Engine,
    command: list[str],
    cwd: Path,
    env: dict[str, str],
    timeout_seconds: int,
    cancel_event: asyncio.Event,
    registry: ProcessRegistry,
    emit: EmitEvent,
) -> None:
    await emit(
        JobEvent.make(
            "command",
            engine=engine,
            message=" ".join(command),
            data={"cwd": str(cwd)},
        )
    )
    process = await asyncio.create_subprocess_exec(
        *command,
        cwd=str(cwd),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        start_new_session=True,
    )
    registry.add(job_id, process)
    stderr_tail: list[str] = []

    async def read_stream(stream: asyncio.StreamReader | None, name: str) -> None:
        if stream is None:
            return
        while True:
            line = await stream.readline()
            if not line:
                break
            message = line.decode("utf-8", errors="replace").rstrip()
            if name == "stderr":
                stderr_tail.append(message)
                del stderr_tail[:-20]
            await emit(
                JobEvent.make(
                    "log",
                    engine=engine,
                    stream=name,
                    message=message,
                )
            )

    stdout_task = asyncio.create_task(read_stream(process.stdout, "stdout"))
    stderr_task = asyncio.create_task(read_stream(process.stderr, "stderr"))
    wait_task = asyncio.create_task(process.wait())
    cancel_task = asyncio.create_task(cancel_event.wait())

    try:
        done, _ = await asyncio.wait(
            {wait_task, cancel_task},
            timeout=timeout_seconds,
            return_when=asyncio.FIRST_COMPLETED,
        )
        if cancel_task in done and process.returncode is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            await emit(JobEvent.make("status", engine=engine, message="Process cancelled"))
            raise asyncio.CancelledError()
        if wait_task not in done and process.returncode is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            await emit(JobEvent.make("status", engine=engine, message="Process timeout"))
            raise TimeoutError(f"command timed out after {timeout_seconds}s")
        returncode = await wait_task
        await asyncio.gather(stdout_task, stderr_task)
        if returncode != 0:
            raise CommandFailed(command, returncode, stderr_tail)
    finally:
        cancel_task.cancel()
        registry.remove(job_id, process)
