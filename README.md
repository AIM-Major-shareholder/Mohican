# Mohican

Mohican은 여러 LLM 보안 점검 도구의 장점을 하나의 대시보드에서 선택적으로 활용할 수 있게 만든 AI 보안 평가 플랫폼입니다. 기존에는 도구마다 실행 방식, 설정 방법, 결과 포맷이 달라 사용자가 직접 비교하고 운영해야 했지만, Mohican은 평가 대상 등록부터 취약점 유형 선택, 평가 모듈 실행, 결과 확인까지 하나의 흐름으로 통합하여 반복 가능한 LLM 보안 점검 환경을 제공합니다.

## 프로젝트 설명

Mohican은 LLM 모델 및 AI Agent를 대상으로 인젝션 스캐닝을 수행하는 오픈소스 점검 도구들의 장점을 사용자 입장에서 쉽게 활용할 수 있도록 만든 대시보드 형태의 서비스입니다. `garak`, `promptfoo`와 같은 도구들을 각각 따로 실행하는 대신, 하나의 웹 UI에서 평가 대상 API를 등록하고, Prompt Injection, Jailbreak, Tool Abuse 등 원하는 취약점 유형을 선택한 뒤, 각 유형에 적합한 평가 모듈을 조합해 실행할 수 있도록 합니다.

단순히 하나의 스캐너를 제공하는 것이 아니라, 여러 평가 도구의 기능을 모듈화하여 사용자가 상황에 맞는 검사 방식을 선택하고, 결과를 공통된 형식으로 확인할 수 있는 AI 보안 평가 오케스트레이션 플랫폼을 목표로 합니다.

## 어떤 문제를 해결하나요?

LLM을 대상으로 인젝션이나 가드레일 파괴 등을 테스트하는 점검용 도구들은 많이 나와 있지만, 각 도구마다 강점이 있는 테스트 영역과 결과 해석 방식이 다릅니다. 어떤 도구는 Prompt Injection 탐지에 강하고, 어떤 도구는 Jailbreak나 policy bypass 테스트에 적합하며, 또 다른 도구는 커스텀 시나리오 기반 평가에 더 유리할 수 있습니다.

기존에는 사용자가 각 도구의 CLI 사용법, 설정 파일, 실행 옵션, 결과 포맷을 직접 이해하고 따로 실행해야 했습니다. 이 과정은 보안 전문가에게도 반복 작업이 많고, 개발자나 운영팀이 팀 단위로 활용하기에는 진입 장벽이 높습니다.

Mohican은 이러한 문제를 해결하기 위해 여러 오픈소스 평가 도구를 하나의 대시보드에서 선택적으로 사용할 수 있게 만들었습니다. 사용자는 “어떤 도구를 어떻게 실행할지”보다 “어떤 취약점 유형을 점검할지”에 집중할 수 있으며, Mohican은 선택된 기능에 맞는 평가 모듈을 연결하고 결과를 비교 가능한 형태로 정리합니다.

## 주요 기능

- 평가 대상 API 및 모델 정보 등록
- Prompt Injection, Indirect Injection, Jailbreak, Tool Abuse 테스트 선택
- 테스트 블럭 기반 실행 흐름 구성
- `promptfoo`, `garak` 기반 평가 실행
- Job 단위 백그라운드 실행 및 상태 확인
- 실행 로그와 이벤트 스트림 확인
- Summary, Findings, Artifacts 형태의 결과 정규화
- Markdown 보고서 다운로드
- 공격 모듈 랭킹 UI 제공

## 시스템 구조

```text
React Frontend
  -> FastAPI Backend
  -> Job Scheduler
  -> promptfoo / garak subprocess
  -> Target Model API
  -> Normalized Result
  -> Dashboard / Markdown Report
```

Mohican은 `promptfoo`와 `garak`을 장기 실행 프로세스 내부로 직접 import하지 않습니다. 각 도구의 CLI 실행 방식을 유지하고, Job별 작업 디렉토리에 설정 파일과 결과 파일을 생성한 뒤 subprocess로 실행합니다. 이 구조는 도구별 전역 상태 충돌을 줄이고, 실행 결과와 artifact를 재현 가능한 단위로 남기기 위한 설계입니다.

## 레포지토리 구조

```text
.
├── src/                         # React/Vite frontend
├── public/                      # Frontend static assets
├── backend/                     # FastAPI job runner
├── report-generator/            # Markdown report generator
└── docs/
    ├── backend-api.md           # Frontend/backend API notes
    ├── backend-design/          # Runner architecture and schemas
    └── dashboard-blocks/        # UI block/scenario design assets
```

외부 도구 소스(`promptfoo`, `garak`)와 실행 산출물(`.mohican`, `.promptfoo`)은 레포에 포함하지 않습니다. 로컬 실행 시에는 시스템에 설치된 CLI 또는 환경 변수로 연결합니다.

## 실행 방법

### 1. 백엔드 실행

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -e .
PYTHONPATH=src uvicorn mohican_backend.main:app --host 127.0.0.1 --port 8088
```

외부 도구가 레포 밖에 있다면 경로를 명시합니다.

```bash
export MOHICAN_PROMPTFOO_REPO=/path/to/promptfoo
export MOHICAN_GARAK_REPO=/path/to/garak
export MOHICAN_STORAGE_DIR=/path/to/.mohican/jobs
```

### 2. 프론트엔드 실행

```bash
npm install --no-bin-links
npm run dev
```

기본 백엔드 URL은 `http://127.0.0.1:8088`입니다. 다른 백엔드를 사용하려면 다음과 같이 실행합니다.

```bash
VITE_MOHICAN_API_BASE_URL=http://127.0.0.1:8088 npm run dev
```

## 테스트

```bash
npm run build
```

```bash
cd backend
PYTHONPATH=src python -m unittest discover -s tests -v
```

```bash
cd report-generator
python generate_report.py --input sample_results.json --output /tmp/mohican_sample_report.md
```

## 결과 포맷

Mohican은 도구별 결과를 그대로 노출하지 않고 다음 공통 구조로 정규화합니다.

```text
summary
findings
artifacts
engineResults
```

프론트엔드는 이 정규화 결과를 기반으로 전체 요약, 엔진별 결과, finding 목록, artifact 목록, Markdown 보고서를 표시합니다.

## 현재 범위

- `promptfoo`와 `garak` 실행 지원
- 데모 환경 기준 최소 공격 단위 실행
- Block별 상태 표시는 프론트에서 제공
- 실제 실행은 백엔드에서 엔진 단위로 묶어 수행
- 공격 모듈 랭킹은 현재 더미 점수 기반 UI로 제공

## 향후 확장 방향

- Block 단위 실제 실행 결과 분리
- 공격 모듈별 실제 위험 점수 산출
- 커스텀 평가 모듈 추가
- 조직별 정책 기반 평가 템플릿 추가
- 보고서 포맷 확장
