# Mohican

Agent Security Evaluation Web

Agent API를 대상으로 `promptfoo`, `garak`, custom injection suite를 모듈형 adapter로 연결하기 위한 웹 UI 프로토타입입니다.

## Stack

- React 19
- TypeScript
- Vite
- lucide-react

## Run

```bash
npm install --no-bin-links
npm run dev
```

현재 `/mnt/e` 파일시스템에서는 npm symlink 생성이 실패할 수 있어 `--no-bin-links` 설치를 기준으로 잡았습니다.

## Current UI Flow

- Target API 단계에서 Mohican API key, Ollama API URL, Ollama model, request mode 입력
- API key 입력 완료 후 적용할 평가 모델 선택
- 왼쪽 파이프라인에서 현재 진행 단계 표시

## Next Backend Shape

```text
React UI
  -> FastAPI
  -> Redis-backed worker
  -> promptfoo adapter
  -> garak adapter
  -> target Agent API
```
