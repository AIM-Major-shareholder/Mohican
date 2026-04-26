# Mohican

Mohican은 LLM/Agent 보안 평가를 웹에서 실행하고 결과를 통합 관리하는 redteam 대시보드입니다.
웹 UI에서 테스트 블럭을 선택하면 백엔드가 `promptfoo`와 `garak`을 job 단위 subprocess로 실행하고,
결과를 `summary`, `findings`, `artifacts` 형식으로 정규화합니다.

## Repository Layout

```text
.
├── src/                         # React/Vite frontend
├── public/                      # frontend static assets
├── backend/                     # FastAPI job runner
├── report-generator/            # Markdown report generator
└── docs/
    ├── backend-api.md           # frontend/backend API notes
    ├── backend-design/          # runner architecture and schemas
    └── dashboard-blocks/        # UI block/scenario design assets
```

외부 도구 소스(`promptfoo`, `garak`)와 실행 산출물(`.mohican`, `.promptfoo`)은 레포에 포함하지 않습니다.
로컬 실행 시에는 시스템에 설치된 CLI 또는 환경 변수로 연결합니다.

## Frontend

```bash
npm install --no-bin-links
npm run dev
```

기본 API URL은 `http://127.0.0.1:8088`입니다. 필요하면 다음 환경 변수로 바꿉니다.

```bash
VITE_MOHICAN_API_BASE_URL=http://127.0.0.1:8088 npm run dev
```

## Backend

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -e .
PYTHONPATH=src uvicorn mohican_backend.main:app --host 127.0.0.1 --port 8088
```

외부 도구 경로가 레포 밖에 있으면 명시합니다.

```bash
MOHICAN_PROMPTFOO_REPO=/home/kali/aim/promptfoo
MOHICAN_GARAK_REPO=/home/kali/aim/garak
MOHICAN_STORAGE_DIR=/home/kali/aim/.mohican/jobs
```

## Test

```bash
npm run build

cd backend
PYTHONPATH=src python -m unittest discover -s tests -v

cd ../report-generator
python generate_report.py --input sample_results.json --output /tmp/mohican_sample_report.md
```

## Runtime Flow

```text
React UI
  -> FastAPI backend
  -> job scheduler
  -> promptfoo / garak subprocess
  -> target model API
  -> normalized result
  -> dashboard + markdown report
```
