# Redteam Backend Design for Mohican

Mohican은 프론트 레포지토리다. 백엔드는 promptfoo와 garak을 직접 라이브러리처럼 합치지 않고, 엔진별 실행 방식을 보존하는 job runner로 설계한다.

## 결론

```text
Mohican React UI
  -> Mohican API Server
    -> Job Store
    -> Artifact Store
    -> Engine Queue
      -> promptfoo worker
      -> garak worker
    -> Result Normalizer
```

엔진 worker는 백그라운드에서 살아 있지만, 실제 테스트 실행은 job 단위 subprocess로 격리한다.

```text
promptfoo worker
  -> write promptfooconfig.yaml
  -> promptfoo redteam generate
  -> promptfoo eval
  -> parse promptfoo result

garak worker
  -> write garak config / generator options
  -> python -m garak
  -> parse garak report.jsonl + hitlog.jsonl
```

## 왜 subprocess 격리인가

promptfoo와 garak 모두 전역 실행 상태를 가진다.

- promptfoo는 `doRedteamRun()` 내부에서 `cliState`, log callback, eval DB, redteam generation 파일을 다룬다.
- promptfoo의 자체 Express redteam route도 현재 `currentJobId` 하나를 관리하는 단일 실행 구조다.
- garak은 `_config` 전역, `_config.transient.reportfile`, `_config.buffmanager`, CLI args를 전역으로 갱신한다.
- garak harness는 probe별로 detector를 로드하고 report JSONL에 직접 기록한다.

따라서 같은 프로세스에서 여러 테스트를 동시에 돌리면 상태가 섞일 수 있다. 백엔드는 worker는 유지하되, 각 job 실행은 별도 process/workdir로 격리한다.

## 주요 문서

- [Engine Behavior](docs/engine-behavior.md)
- [Runner Logic](docs/runner-logic.md)
- [Mohican API Contract](api/mohican-api-contract.md)
- [Job Request Schema](schemas/job-request.schema.json)
- [Normalized Result Schema](schemas/normalized-result.schema.json)

## Backend Package Shape

```text
mohican-backend/
  app/
    main.py
    api/
      jobs.py
      catalog.py
      health.py
    core/
      job_store.py
      artifact_store.py
      event_bus.py
      process_runner.py
    engines/
      promptfoo/
        config_builder.py
        runner.py
        parser.py
        catalog.py
      garak/
        config_builder.py
        runner.py
        parser.py
        catalog.py
    normalizers/
      result.py
    workers/
      scheduler.py
      promptfoo_worker.py
      garak_worker.py
```

FastAPI를 기준으로 잡는 것이 가장 단순하다. promptfoo는 CLI subprocess로 호출하고, garak은 Python module subprocess로 호출한다.

## Job State

```text
queued
preparing
generating
running
parsing
completed
failed
cancelled
```

promptfoo는 `generating`과 `running`이 분리된다. garak은 probe가 실행 중에 payload 생성, target call, detector, evaluator를 함께 수행하므로 대부분 `running`으로 묶인다.

## Artifact Layout

```text
storage/jobs/{job_id}/
  request.json
  status.json
  events.jsonl
  stdout.log
  stderr.log
  engine/
    promptfooconfig.yaml
    redteam.yaml
    promptfoo-results.json
    garak.config.yaml
    garak.generator.json
    garak.{run_id}.report.jsonl
    garak.{run_id}.hitlog.jsonl
    garak.{run_id}.report.html
  normalized-result.json
```

## Mohican Mapping

Mohican의 현재 UI 필드는 그대로 쓴다.

```text
apiKey      -> target.apiKey
baseUrl     -> target.baseUrl
model       -> target.model
requestMode -> target.requestMode: chat | generate
selectedModelsByFeature -> selections[]
```

`promptfoo`, `garak`, `custom-suite` 선택은 backend `engine` 선택으로 변환한다.
