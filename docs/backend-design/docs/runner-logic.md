# Runner Logic

## 공통 Job Flow

```text
POST /api/jobs
  -> validate request
  -> create job_id
  -> write request.json
  -> enqueue engine tasks
  -> return job_id

worker
  -> claim job
  -> prepare per-job workdir
  -> build engine config
  -> spawn engine subprocess
  -> stream stdout/stderr to events
  -> parse artifacts
  -> normalize result
  -> mark completed/failed
```

## Process Rules

- job마다 workdir를 분리한다.
- job마다 env를 분리한다.
- API key는 파일에 평문 저장하지 않는다. 필요하면 worker env로만 전달한다.
- stdout/stderr는 line 단위로 event log에 쌓는다.
- timeout 초과 시 process tree를 종료한다.
- cancel 요청 시 subprocess에 terminate를 보내고 일정 시간 후 kill한다.

## promptfoo Runner

### Config Builder

Mohican target이 Ollama `chat` 모드일 때:

```yaml
description: Mohican promptfoo run
prompts:
  - "{{prompt}}"
providers:
  - id: http
    label: mohican-target
    config:
      url: "{{baseUrl}}/chat"
      method: POST
      headers:
        Content-Type: application/json
        Authorization: "Bearer {{apiKey}}"
      body:
        model: "{{model}}"
        stream: false
        messages:
          - role: user
            content: "{{prompt}}"
      transformResponse: json.message.content
redteam:
  purpose: "{{purpose}}"
  numTests: "{{numTests}}"
  plugins: []
  strategies: []
```

Mohican target이 Ollama `generate` 모드일 때:

```yaml
providers:
  - id: http
    label: mohican-target
    config:
      url: "{{baseUrl}}/generate"
      method: POST
      headers:
        Content-Type: application/json
        Authorization: "Bearer {{apiKey}}"
      body:
        model: "{{model}}"
        stream: false
        prompt: "{{prompt}}"
      transformResponse: json.response
```

### Execution

```bash
promptfoo redteam generate \
  -c promptfooconfig.yaml \
  -o redteam.yaml \
  --force \
  --no-progress-bar

promptfoo eval \
  -c redteam.yaml \
  -o promptfoo-results.json \
  --no-table \
  --max-concurrency 4
```

### Parse

Use the JSON output as the primary artifact. If DB persistence is enabled, the eval id from stdout/logs may also be captured, but Mohican should not depend on promptfoo's local DB.

## garak Runner

### Generator Options for Ollama Chat

```json
{
  "rest": {
    "RestGenerator": {
      "uri": "http://10.30.0.93:11434/api/chat",
      "method": "post",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer $KEY"
      },
      "req_template_json_object": {
        "model": "gpt-oss:20b",
        "stream": false,
        "messages": [
          {
            "role": "user",
            "content": "$INPUT"
          }
        ]
      },
      "response_json": true,
      "response_json_field": "$.message.content",
      "request_timeout": 30
    }
  }
}
```

### Generator Options for Ollama Generate

```json
{
  "rest": {
    "RestGenerator": {
      "uri": "http://10.30.0.93:11434/api/generate",
      "method": "post",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer $KEY"
      },
      "req_template_json_object": {
        "model": "gpt-oss:20b",
        "stream": false,
        "prompt": "$INPUT"
      },
      "response_json": true,
      "response_json_field": "$.response",
      "request_timeout": 30
    }
  }
}
```

Set `REST_API_KEY` in the subprocess environment when the target API key is present.

### Execution

```bash
python -m garak \
  --target_type rest \
  --generator_option_file garak.generator.json \
  --probes promptinject,dan \
  --buffs encoding.Base64 \
  --generations 1 \
  --parallel_attempts 4 \
  --report_prefix job_123
```

### Parse

Primary artifacts:

- `job_123.report.jsonl`
- `job_123.hitlog.jsonl`
- `job_123.report.html`

Parse `entry_type == "eval"` for summary rows and `hitlog.jsonl` for finding evidence. Attempt records can fill prompt/response gaps.

## Feature Mapping

| Mohican feature | promptfoo mapping | garak mapping |
| --- | --- | --- |
| `prompt-injection` | `prompt-extraction`, `hijacking`, `indirect-prompt-injection`; strategies `basic`, `prompt-injection`, `base64` | probes `promptinject`, `goodside.Tag`, `latentinjection`, `smuggling`, `doctor`; buffs `base64`, `charcode` |
| `indirect-injection` | `indirect-prompt-injection`, `rag-document-exfiltration`, `rag-poisoning` | probes `latentinjection`, `web_injection` |
| `jailbreak` | harmful/safety plugins with strategies `jailbreak`, `crescendo`, `best-of-n`, `base64`, `rot13` | probes `dan`, `tap`, `suffix`, `fitd`, `dra`, `grandma`, `phrasing` |
| `tool-abuse` | `tool-discovery`, `excessive-agency`, `shell-injection`, `ssrf`, `mcp` | probes `exploitation`, `web_injection`; garak coverage is weaker than promptfoo here |

## Normalization Rules

Every engine result becomes:

```text
job
  summary
  findings[]
  artifacts[]
  logs[]
```

Severity should be derived as:

```text
critical: credential leakage, command execution, confirmed tool abuse
high: jailbreak success, policy bypass, data exfiltration
medium: hallucination, misinformation, weak refusal
low: instability, formatting, inconclusive detector hit
```
