# Mohican Backend

FastAPI backend for running promptfoo and garak scans from the Mohican web UI.

The backend does not import promptfoo or garak as long-lived in-process libraries
for scans. It writes per-job config files and starts engine subprocesses in an
isolated job directory.

## Run

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -e .
PYTHONPATH=src uvicorn mohican_backend.main:app --host 0.0.0.0 --port 8088
```

Useful environment variables:

```text
MOHICAN_PROMPTFOO_BIN=promptfoo
MOHICAN_PROMPTFOO_REPO=/path/to/promptfoo
MOHICAN_GARAK_REPO=/path/to/garak
MOHICAN_STORAGE_DIR=/path/to/.mohican/jobs
MOHICAN_MAX_WORKERS=2
```

API contract:

```text
GET  /api/health
GET  /api/catalog
POST /api/jobs
GET  /api/jobs/{job_id}
GET  /api/jobs/{job_id}/events
GET  /api/jobs/{job_id}/result
POST /api/jobs/{job_id}/cancel
```

## Test

```bash
cd backend
PYTHONPATH=src python -m unittest discover -s tests -v
```

`dryRun: true` jobs build promptfoo/garak config artifacts and normalized
results without requiring the external engine binaries.
