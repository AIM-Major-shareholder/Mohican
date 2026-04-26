# Mohican Backend API Contract

Base URL:

```text
VITE_MOHICAN_API_BASE_URL=http://localhost:8088
```

## Catalog

```http
GET /api/catalog
```

Response:

```json
{
  "engines": ["promptfoo", "garak", "custom-suite"],
  "features": [
    {
      "id": "prompt-injection",
      "label": "Prompt Injection",
      "recommendedEngines": ["garak", "promptfoo"]
    }
  ],
  "mappings": {
    "prompt-injection": {
      "promptfoo": {
        "plugins": ["prompt-extraction", "hijacking", "indirect-prompt-injection"],
        "strategies": ["basic", "base64"]
      },
      "garak": {
        "probes": ["promptinject", "goodside.Tag", "latentinjection", "smuggling"],
        "buffs": ["encoding.Base64"]
      }
    }
  }
}
```

## Create Job

```http
POST /api/jobs
Content-Type: application/json
```

Request:

```json
{
  "target": {
    "baseUrl": "http://10.30.0.93:11434/api",
    "apiKey": "optional-key",
    "model": "gpt-oss:20b",
    "requestMode": "chat"
  },
  "selections": [
    {
      "featureId": "prompt-injection",
      "engines": ["promptfoo", "garak"]
    }
  ],
  "runOptions": {
    "numTests": 5,
    "maxConcurrency": 4,
    "timeoutSeconds": 900
  }
}
```

Response:

```json
{
  "jobId": "job_01JABC",
  "status": "queued"
}
```

## Job Status

```http
GET /api/jobs/{jobId}
```

Response:

```json
{
  "jobId": "job_01JABC",
  "status": "running",
  "progress": {
    "phase": "running",
    "completed": 12,
    "total": 40
  },
  "engines": [
    {
      "engine": "promptfoo",
      "status": "running"
    },
    {
      "engine": "garak",
      "status": "queued"
    }
  ]
}
```

## Job Events

Use SSE for live logs.

```http
GET /api/jobs/{jobId}/events
```

Events:

```text
event: status
data: {"status":"running","phase":"generating"}

event: log
data: {"engine":"promptfoo","stream":"stdout","message":"Generating test cases..."}

event: finding
data: {"engine":"garak","severity":"high","category":"jailbreak"}
```

## Job Result

```http
GET /api/jobs/{jobId}/result
```

Response follows [normalized-result.schema.json](../schemas/normalized-result.schema.json).

## Cancel

```http
POST /api/jobs/{jobId}/cancel
```

Response:

```json
{
  "jobId": "job_01JABC",
  "status": "cancelled"
}
```
