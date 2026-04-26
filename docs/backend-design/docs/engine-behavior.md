# Engine Behavior Notes

이 설계는 promptfoo와 garak 코드의 실제 동작 단위를 기준으로 한다.

## promptfoo

관련 코드:

- `promptfoo/src/redteam/commands/run.ts`
- `promptfoo/src/redteam/shared.ts`
- `promptfoo/src/redteam/commands/generate.ts`
- `promptfoo/src/commands/eval.ts`
- `promptfoo/src/server/routes/redteam.ts`

promptfoo redteam 실행은 두 단계다.

```text
doRedteamRun()
  -> doGenerateRedteam()
       -> resolve config
       -> synthesize test cases from plugins/strategies
       -> write redteam.yaml
  -> doEval()
       -> load redteam.yaml
       -> evaluate testSuite against providers
       -> persist Eval
       -> write configured output files
```

promptfoo의 자체 서버 route도 이 구조를 쓴다.

```text
POST /redteam/run
  -> create job id in memory
  -> doRedteamRun({
       liveRedteamConfig,
       logCallback,
       abortSignal
     })
  -> evalResult.toEvaluateSummary()
```

제약:

- 자체 route는 `currentJobId` 기반이라 동시에 여러 redteam run을 운영하는 서버 설계로는 부족하다.
- `cliState.webUI`, `cliState.maxConcurrency`, logger callback 같은 전역 상태가 있다.
- 따라서 Mohican backend에서는 promptfoo를 같은 Node process에 import하지 않고 job subprocess로 실행한다.

권장 실행:

```text
promptfoo redteam generate -c promptfooconfig.yaml -o redteam.yaml --force
promptfoo eval -c redteam.yaml -o promptfoo-results.json --no-table --max-concurrency N
```

`redteam run` 한 번으로도 가능하지만, 서버 상태 추적과 artifact 분리를 위해 generate/eval을 나누는 편이 낫다.

## garak

관련 코드:

- `garak/garak/cli.py`
- `garak/garak/command.py`
- `garak/garak/harnesses/probewise.py`
- `garak/garak/harnesses/base.py`
- `garak/garak/evaluators/base.py`
- `garak/garak/generators/rest.py`
- `garak/garak/report.py`

garak 실행은 CLI가 전역 `_config`를 구성한 뒤 harness가 probe를 돌리는 구조다.

```text
python -m garak
  -> parse CLI/config
  -> _config.plugins.target_type / probe_spec / detector_spec / buff_spec 설정
  -> load generator
  -> command.start_run()
       -> open garak.{run_id}.report.jsonl
  -> probewise_run() or pxd_run()
       -> load probe
       -> choose detectors
       -> probe.probe(model)
       -> detector.detect(attempt)
       -> evaluator.evaluate(attempts)
       -> write attempt/eval records to report.jsonl
       -> write failures to hitlog.jsonl
  -> command.end_run()
       -> close report
       -> write html digest
```

제약:

- `_config`가 전역이다.
- `_config.transient.reportfile`을 직접 연다.
- buff manager도 전역이다.
- 하나의 Python process에서 여러 garak run을 동시에 돌리면 안전하지 않다.

권장 실행:

```text
python -m garak \
  --target_type rest \
  --generator_option_file garak.generator.json \
  --probes dan,promptinject \
  --buffs encoding.Base64 \
  --report_prefix {job_id}
```

REST target은 `garak.generators.rest.RestGenerator`를 쓴다. `$INPUT`이 payload로 치환되고, JSON 응답은 `response_json_field`로 추출한다.
