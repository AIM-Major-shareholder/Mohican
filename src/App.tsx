import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Download,
  FileDown,
  KeyRound,
  Layers3,
  Moon,
  Play,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sun,
  TerminalSquare,
} from 'lucide-react';
import {
  attackCategories,
  defaultTarget,
  findings,
  initialModules,
  metrics,
  runnerEvents,
  steps,
} from './data';
import type { EvalModule, Finding, ReportMetric, StepId, TargetConfig } from './types';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function App() {
  const [activeStep, setActiveStep] = useState<StepId>('target');
  const [target, setTarget] = useState<TargetConfig>(defaultTarget);
  const [modules, setModules] = useState<EvalModule[]>(initialModules);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(attackCategories.slice(0, 5));
  const [concurrency, setConcurrency] = useState(8);
  const [numTests, setNumTests] = useState(180);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const enabledModules = modules.filter((module) => module.enabled);
  const totalModuleTests = enabledModules.reduce((sum, module) => sum + module.tests, 0);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 100) {
          window.clearInterval(interval);
          setIsRunning(false);
          setActiveStep('report');
          return 100;
        }
        return Math.min(current + 7, 100);
      });
    }, 500);

    return () => window.clearInterval(interval);
  }, [isRunning]);

  const toggleModule = (id: string) => {
    setModules((current) =>
      current.map((module) =>
        module.id === id
          ? {
              ...module,
              enabled: !module.enabled,
              status: !module.enabled ? 'configured' : 'disabled',
            }
          : module,
      ),
    );
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  };

  const startRun = () => {
    setActiveStep('run');
    setProgress(4);
    setIsRunning(true);
  };

  const resetRun = () => {
    setProgress(0);
    setIsRunning(false);
  };

  const pageTitle = {
    target: 'Agent Target',
    modules: 'Evaluation Modules',
    run: 'Run Plan',
    report: 'Assessment Report',
  }[activeStep];

  return (
    <div className="app-shell">
      <Header isDark={isDark} onToggleTheme={() => setIsDark((value) => !value)} />
      <div className="workspace">
        <Sidebar
          activeStep={activeStep}
          onStepChange={setActiveStep}
          moduleCount={enabledModules.length}
          hasReport={progress === 100}
          onReset={resetRun}
        />
        <main className="main-panel">
          <PageHeader
            title={pageTitle}
            targetName={target.name}
            totalTests={Math.max(numTests, totalModuleTests)}
            progress={progress}
            isRunning={isRunning}
          />

          {activeStep === 'target' && (
            <TargetStep target={target} onChange={setTarget} onNext={() => setActiveStep('modules')} />
          )}
          {activeStep === 'modules' && (
            <ModulesStep
              modules={modules}
              selectedCategories={selectedCategories}
              onToggleModule={toggleModule}
              onToggleCategory={toggleCategory}
              onNext={() => setActiveStep('run')}
              onBack={() => setActiveStep('target')}
            />
          )}
          {activeStep === 'run' && (
            <RunStep
              target={target}
              modules={enabledModules}
              selectedCategories={selectedCategories}
              concurrency={concurrency}
              numTests={numTests}
              progress={progress}
              isRunning={isRunning}
              onConcurrencyChange={setConcurrency}
              onNumTestsChange={setNumTests}
              onStart={startRun}
              onReset={resetRun}
              onBack={() => setActiveStep('modules')}
            />
          )}
          {activeStep === 'report' && (
            <ReportStep
              target={target}
              modules={enabledModules}
              progress={progress}
              onRunAgain={startRun}
              onBack={() => setActiveStep('run')}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function Header({ isDark, onToggleTheme }: { isDark: boolean; onToggleTheme: () => void }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <ShieldCheck size={20} />
        </span>
        <span className="brand-name">AgentEval</span>
      </div>
      <nav className="topnav" aria-label="Primary">
        <a className="topnav-link active" href="#new">
          New Assessment
        </a>
        <a className="topnav-link" href="#reports">
          Reports
        </a>
        <a className="topnav-link" href="#runs">
          Runs
        </a>
        <a className="topnav-link" href="#targets">
          Targets
        </a>
      </nav>
      <div className="topbar-actions">
        <span className="env-pill">
          <CircleDot size={12} />
          Local runner
        </span>
        <button className="icon-button" type="button" aria-label="Settings">
          <Settings size={18} />
        </button>
        <button className="icon-button" type="button" aria-label="Toggle theme" onClick={onToggleTheme}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}

function Sidebar({
  activeStep,
  moduleCount,
  hasReport,
  onStepChange,
  onReset,
}: {
  activeStep: StepId;
  moduleCount: number;
  hasReport: boolean;
  onStepChange: (step: StepId) => void;
  onReset: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-status">
        <p className="status-title">New Assessment</p>
        <p className="status-subtitle">{hasReport ? 'Report ready' : 'Draft configuration'}</p>
      </div>
      <div className="step-list">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              className={cx('step-button', activeStep === step.id && 'active')}
              type="button"
              onClick={() => onStepChange(step.id)}
            >
              <Icon size={18} />
              <span>{step.label}</span>
              {step.id === 'modules' && moduleCount > 0 ? (
                <span className="step-count">{moduleCount}</span>
              ) : (
                <span className="step-index">{index + 1}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="sidebar-actions">
        <button className="ghost-action" type="button">
          <Save size={18} />
          Save Config
        </button>
        <button className="ghost-action" type="button">
          <FileDown size={18} />
          Export YAML
        </button>
        <button className="ghost-action" type="button" onClick={onReset}>
          <RotateCcw size={18} />
          Reset Run
        </button>
      </div>
    </aside>
  );
}

function PageHeader({
  title,
  targetName,
  totalTests,
  progress,
  isRunning,
}: {
  title: string;
  targetName: string;
  totalTests: number;
  progress: number;
  isRunning: boolean;
}) {
  return (
    <section className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{targetName} · {totalTests} planned tests</p>
      </div>
      <div className="header-metrics">
        <MiniMetric label="Runner" value={isRunning ? 'Running' : 'Idle'} tone={isRunning ? 'blue' : 'neutral'} />
        <MiniMetric label="Progress" value={`${progress}%`} tone={progress === 100 ? 'green' : 'neutral'} />
      </div>
    </section>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'green' | 'neutral' }) {
  return (
    <div className={cx('mini-metric', `tone-${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TargetStep({
  target,
  onChange,
  onNext,
}: {
  target: TargetConfig;
  onChange: (target: TargetConfig) => void;
  onNext: () => void;
}) {
  return (
    <div className="content-grid target-grid">
      <section className="panel form-panel">
        <div className="section-heading">
          <h2>Target Connection</h2>
          <p>권한을 가진 Agent API만 평가 대상으로 등록합니다.</p>
        </div>
        <div className="form-grid">
          <label className="field span-2">
            <span>Target name</span>
            <input
              value={target.name}
              onChange={(event) => onChange({ ...target, name: event.target.value })}
            />
          </label>
          <label className="field span-2">
            <span>Endpoint</span>
            <input
              value={target.endpoint}
              onChange={(event) => onChange({ ...target, endpoint: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Method</span>
            <select
              value={target.method}
              onChange={(event) => onChange({ ...target, method: event.target.value as TargetConfig['method'] })}
            >
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
            </select>
          </label>
          <label className="field">
            <span>Model ID</span>
            <input
              value={target.model}
              onChange={(event) => onChange({ ...target, model: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Auth header</span>
            <input
              value={target.authHeader}
              onChange={(event) => onChange({ ...target, authHeader: event.target.value })}
            />
          </label>
          <label className="field key-field">
            <span>API key</span>
            <div className="input-with-icon">
              <KeyRound size={16} />
              <input
                type="password"
                value={target.apiKey}
                placeholder="sk-..."
                onChange={(event) => onChange({ ...target, apiKey: event.target.value })}
              />
            </div>
          </label>
          <label className="field">
            <span>Timeout seconds</span>
            <input
              min={10}
              max={180}
              type="number"
              value={target.timeout}
              onChange={(event) => onChange({ ...target, timeout: Number(event.target.value) })}
            />
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={target.stateful}
              onChange={(event) => onChange({ ...target, stateful: event.target.checked })}
            />
            <span>
              Stateful session
              <small>대화 메모리와 멀티턴 injection을 포함합니다.</small>
            </span>
          </label>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button">
            Test Connection
          </button>
          <button className="primary-button" type="button" onClick={onNext}>
            Continue
            <ChevronRight size={16} />
          </button>
        </div>
      </section>

      <section className="panel contract-panel">
        <div className="section-heading">
          <h2>Request Contract</h2>
          <p>Runner adapter가 사용할 표준 요청 형태입니다.</p>
        </div>
        <pre className="code-block">{`{
  "input": "{{prompt}}",
  "session_id": "{{sessionId}}",
  "metadata": {
    "source": "agent-eval",
    "module": "{{adapter}}"
  }
}`}</pre>
        <div className="contract-list">
          <StatusLine label="Auth isolation" status="masked" />
          <StatusLine label="Response parser" status="json.content" />
          <StatusLine label="Rate limit policy" status="8 concurrent" />
        </div>
      </section>
    </div>
  );
}

function StatusLine({ label, status }: { label: string; status: string }) {
  return (
    <div className="status-line">
      <span>{label}</span>
      <strong>{status}</strong>
    </div>
  );
}

function ModulesStep({
  modules,
  selectedCategories,
  onToggleModule,
  onToggleCategory,
  onNext,
  onBack,
}: {
  modules: EvalModule[];
  selectedCategories: string[];
  onToggleModule: (id: string) => void;
  onToggleCategory: (category: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="stack">
      <section className="section-band">
        <div className="section-heading">
          <h2>Adapter Modules</h2>
          <p>각 도구는 공통 finding schema로 정규화됩니다.</p>
        </div>
        <div className="module-grid">
          {modules.map((module) => (
            <ModuleCard key={module.id} module={module} onToggle={() => onToggleModule(module.id)} />
          ))}
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading">
          <h2>Attack Coverage</h2>
          <p>이번 run에 포함할 공격 범주를 선택합니다.</p>
        </div>
        <div className="chip-grid">
          {attackCategories.map((category) => (
            <button
              key={category}
              className={cx('chip', selectedCategories.includes(category) && 'selected')}
              type="button"
              onClick={() => onToggleCategory(category)}
            >
              {selectedCategories.includes(category) ? <CheckCircle2 size={15} /> : <CircleDot size={15} />}
              {category}
            </button>
          ))}
        </div>
      </section>

      <div className="button-row spread">
        <button className="secondary-button" type="button" onClick={onBack}>
          Back
        </button>
        <button className="primary-button" type="button" onClick={onNext}>
          Configure Run
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function ModuleCard({ module, onToggle }: { module: EvalModule; onToggle: () => void }) {
  return (
    <article className={cx('module-card', module.enabled && 'enabled')}>
      <div className="module-head">
        <div>
          <p className="eyebrow">{module.adapter}</p>
          <h3>{module.name}</h3>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={module.enabled} onChange={onToggle} />
          <span />
        </label>
      </div>
      <p className="module-description">{module.description}</p>
      <div className="module-foot">
        <span>{module.tests} tests</span>
        <span className={cx('status-badge', module.status)}>{module.status}</span>
      </div>
      <div className="coverage-row">
        {module.coverage.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </article>
  );
}

function RunStep({
  target,
  modules,
  selectedCategories,
  concurrency,
  numTests,
  progress,
  isRunning,
  onConcurrencyChange,
  onNumTestsChange,
  onStart,
  onReset,
  onBack,
}: {
  target: TargetConfig;
  modules: EvalModule[];
  selectedCategories: string[];
  concurrency: number;
  numTests: number;
  progress: number;
  isRunning: boolean;
  onConcurrencyChange: (value: number) => void;
  onNumTestsChange: (value: number) => void;
  onStart: () => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const estimatedMinutes = Math.max(6, Math.round((numTests / Math.max(concurrency, 1)) * 0.8));

  return (
    <div className="content-grid run-grid">
      <section className="panel form-panel">
        <div className="section-heading">
          <h2>Execution Options</h2>
          <p>worker queue에 전달될 실행 파라미터입니다.</p>
        </div>
        <div className="run-options">
          <label className="field">
            <span>Max concurrency</span>
            <input
              type="range"
              min={1}
              max={24}
              value={concurrency}
              onChange={(event) => onConcurrencyChange(Number(event.target.value))}
            />
            <strong>{concurrency}</strong>
          </label>
          <label className="field">
            <span>Generated tests</span>
            <input
              type="number"
              min={20}
              max={500}
              value={numTests}
              onChange={(event) => onNumTestsChange(Number(event.target.value))}
            />
          </label>
          <div className="run-summary">
            <SummaryItem label="Target" value={target.model} />
            <SummaryItem label="Modules" value={modules.map((module) => module.adapter).join(', ') || 'none'} />
            <SummaryItem label="Coverage" value={`${selectedCategories.length} categories`} />
            <SummaryItem label="Estimate" value={`${estimatedMinutes} min`} />
          </div>
        </div>
        <div className="button-row spread">
          <button className="secondary-button" type="button" onClick={onBack}>
            Back
          </button>
          <div className="button-row compact">
            <button className="secondary-button" type="button" onClick={onReset}>
              Reset
            </button>
            <button className="primary-button" type="button" onClick={onStart} disabled={modules.length === 0 || isRunning}>
              <Play size={16} />
              {isRunning ? 'Running' : 'Start Evaluation'}
            </button>
          </div>
        </div>
      </section>

      <section className="panel runner-panel">
        <div className="section-heading">
          <h2>Runner Status</h2>
          <p>{isRunning ? 'Evaluation job is active.' : 'Ready to enqueue a new job.'}</p>
        </div>
        <div className="progress-shell">
          <div className="progress-label">
            <span>Overall progress</span>
            <strong>{progress}%</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="event-list">
          {runnerEvents.map((event, index) => {
            const Icon = event.icon;
            const reached = progress > index * 24 || progress === 100;
            return (
              <div key={event.label} className={cx('event-row', reached && 'reached')}>
                <Icon size={17} />
                <span>{event.time}</span>
                <strong>{event.label}</strong>
              </div>
            );
          })}
        </div>
        <div className="terminal">
          <div className="terminal-title">
            <TerminalSquare size={16} />
            worker.log
          </div>
          <code>
            {`[queue] target=${target.name}
[adapter] promptfoo: ${modules.some((module) => module.id === 'promptfoo') ? 'enabled' : 'disabled'}
[adapter] garak: ${modules.some((module) => module.id === 'garak') ? 'enabled' : 'disabled'}
[runner] progress=${progress}%`}
          </code>
        </div>
      </section>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReportStep({
  target,
  modules,
  progress,
  onRunAgain,
  onBack,
}: {
  target: TargetConfig;
  modules: EvalModule[];
  progress: number;
  onRunAgain: () => void;
  onBack: () => void;
}) {
  const shownFindings = useMemo(() => {
    const enabledAdapters = new Set(modules.map((module) => module.adapter));
    return findings.filter((finding) => enabledAdapters.has(finding.module) || finding.module === 'custom');
  }, [modules]);

  return (
    <div className="stack">
      {progress < 100 && (
        <div className="notice">
          <AlertTriangle size={18} />
          <span>Run이 완료되지 않아 mock baseline report를 표시합니다.</span>
        </div>
      )}
      <section className="metric-grid">
        {metrics.map((metric) => (
          <ScoreCard key={metric.label} metric={metric} />
        ))}
      </section>

      <div className="content-grid report-grid">
        <section className="panel">
          <div className="section-heading horizontal">
            <div>
              <h2>Module Performance</h2>
              <p>{target.name} 기준 정규화 점수입니다.</p>
            </div>
            <button className="secondary-button small" type="button">
              <Download size={15} />
              Export
            </button>
          </div>
          <div className="result-table" role="table" aria-label="Module performance">
            <div className="table-row head" role="row">
              <span>Module</span>
              <span>Pass</span>
              <span>Findings</span>
              <span>Latency</span>
            </div>
            {modules.map((module, index) => (
              <div className="table-row" role="row" key={module.id}>
                <span>{module.name}</span>
                <span>{index === 0 ? '78%' : '84%'}</span>
                <span>{index === 0 ? '11' : '7'}</span>
                <span>{index === 0 ? '1.8s' : '2.4s'}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>Severity Mix</h2>
            <p>검출 결과의 위험도 분포입니다.</p>
          </div>
          <div className="severity-bars">
            <SeverityBar label="Critical" value={18} tone="critical" />
            <SeverityBar label="High" value={32} tone="high" />
            <SeverityBar label="Medium" value={41} tone="medium" />
            <SeverityBar label="Low" value={64} tone="low" />
          </div>
        </section>
      </div>

      <section className="section-band">
        <div className="section-heading horizontal">
          <div>
            <h2>Findings</h2>
            <p>모듈별 취약 응답과 재현 가능한 프롬프트입니다.</p>
          </div>
          <div className="button-row compact">
            <button className="secondary-button" type="button" onClick={onBack}>
              Run Settings
            </button>
            <button className="primary-button" type="button" onClick={onRunAgain}>
              <Play size={16} />
              Run Again
            </button>
          </div>
        </div>
        <div className="finding-list">
          {shownFindings.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ScoreCard({ metric }: { metric: ReportMetric }) {
  return (
    <article className="score-card">
      <div className={cx('score-ring', metric.tone)} style={{ '--score': metric.value } as React.CSSProperties}>
        <span>{metric.value}</span>
      </div>
      <div>
        <h3>{metric.label}</h3>
        <p>{metric.delta}</p>
      </div>
    </article>
  );
}

function SeverityBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'critical' | 'high' | 'medium' | 'low';
}) {
  return (
    <div className="severity-row">
      <span>{label}</span>
      <div className="bar-track">
        <div className={cx('bar-fill', tone)} style={{ width: `${value}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <article className="finding-row">
      <div className="finding-main">
        <div className="finding-title">
          <span className={cx('severity-badge', finding.severity)}>{finding.severity}</span>
          <h3>{finding.title}</h3>
        </div>
        <p>{finding.category} · {finding.module} · {finding.id}</p>
      </div>
      <div className="finding-detail">
        <span>{finding.prompt}</span>
        <strong>{finding.response}</strong>
      </div>
    </article>
  );
}

export default App;
