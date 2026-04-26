# Redteam Dashboard Execution Blocks

웹 버튼과 promptfoo/garak payload 모듈을 연결하기 위한 실행블럭 예시입니다.

## 원칙

- 버튼 하나는 블럭 하나만 호출한다.
- 블럭 하나는 동작 하나만 수행한다.
- 여러 동작이 필요한 테스트는 블럭을 합치지 않고 시나리오에서 순서만 정한다.
- payload 생성, payload 강화, target 호출, 평가, 저장은 각각 별도 블럭이다.

## 파일

- [configs/blocks.json](configs/blocks.json): 웹 버튼이 호출할 원자 실행블럭.
- [configs/module_placements.json](configs/module_placements.json): promptfoo/garak 모듈을 UI 영역과 버튼에 배치한 설정.
- [configs/scenarios.json](configs/scenarios.json): 블럭을 조합한 예시 실행 시나리오.
- [schema/block.schema.json](schema/block.schema.json): 블럭 설정 JSON Schema.
- [tools/validate_blocks.py](tools/validate_blocks.py): 단일 동작 규칙과 참조 무결성 검증.

## 블럭 실행 모델

```text
button click
  -> block id
  -> one operation
  -> one output state key
  -> next block or scenario step
```

예:

```text
btn-pf-prompt-injection-generate
  -> payload.generate.promptfoo
  -> payload_batch
```

강화까지 같이 하지 않습니다. 강화 버튼은 별도입니다.

```text
btn-pf-strengthen-base64
  -> payload.strengthen.promptfoo
  -> strengthened_payload_batch
```

## 통합 시 매핑

대시보드 실행 레이어는 `operation`만 보고 handler를 선택하면 됩니다.

| operation | handler 책임 |
| --- | --- |
| `context.create` | 폼 입력을 공통 context로 변환 |
| `payload.generate.promptfoo` | `promptfoo_payloads.generate_payloads()` 호출 |
| `payload.generate.garak` | `garak_payloads.generate_payloads()` 호출 |
| `payload.strengthen.promptfoo` | promptfoo strategy 하나 적용 |
| `payload.strengthen.garak` | garak buff 하나 적용 |
| `payload.preview` | payload preview state 생성 |
| `target.dispatch` | payload 하나를 target adapter에 전달 |
| `response.evaluate` | response 하나를 evaluator에 전달 |
| `result.persist` | result 하나 저장 |
| `queue.enqueue` | payload batch를 queue에 적재 |

## 검증

```bash
python redteam_dashboard_blocks/tools/validate_blocks.py
```
