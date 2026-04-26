# Mohican Backend API

Mohican 프론트는 promptfoo/garak을 직접 실행하지 않는다. 프론트는 백엔드에 job을 만들고, 상태와 결과를 조회한다.

## Environment

```text
VITE_MOHICAN_API_BASE_URL=http://localhost:8088
```

## Frontend Flow

현재 `src/App.tsx`의 값은 아래처럼 백엔드 request로 변환한다.

```text
targetConfig.apiKey      -> target.apiKey
targetConfig.baseUrl     -> target.baseUrl
targetConfig.model       -> target.model
targetConfig.requestMode -> target.requestMode
selectedModelsByFeature  -> selections
runOptions               -> runOptions
```

화면 흐름:

```text
대상 연결
  -> 다음 단계로: 입력값 검증 후 기능별 모델 선택으로 이동
기능별 모델 선택
  -> 선택 완료: POST /api/jobs 호출
평가 실행
  -> GET /api/jobs/{jobId} polling
  -> GET /api/jobs/{jobId}/events SSE 수신
결과 확인
  -> GET /api/jobs/{jobId}/result 결과 표시
```

## Create Job

```ts
await fetch(`${apiBaseUrl}/api/jobs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    target: {
      apiKey: targetConfig.apiKey,
      baseUrl: targetConfig.baseUrl,
      model: targetConfig.model,
      requestMode: targetConfig.requestMode,
    },
    selections: Object.entries(selectedModelsByFeature)
      .filter(([, engines]) => engines.length > 0)
      .map(([featureId, engines]) => ({ featureId, engines })),
    runOptions: {
      numTests: 5,
      maxConcurrency: 4,
      timeoutSeconds: 900,
    },
  }),
});
```

## Required Endpoints

```text
GET  /api/catalog
POST /api/jobs
GET  /api/jobs/{jobId}
GET  /api/jobs/{jobId}/events
GET  /api/jobs/{jobId}/result
POST /api/jobs/{jobId}/cancel
```

Detailed backend design lives in [backend-design/README.md](backend-design/README.md).
