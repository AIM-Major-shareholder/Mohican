import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, KeyRound, Layers3, Moon, ShieldCheck, Sun } from 'lucide-react';

type PipelineStepId = 'target-api' | 'model-select' | 'run' | 'report';
type RequestMode = 'chat' | 'generate';
type InjectionFeatureId =
  | 'prompt-injection'
  | 'indirect-injection'
  | 'jailbreak'
  | 'tool-abuse';

interface PipelineStep {
  id: PipelineStepId;
  title: string;
  description: string;
}

interface EvalModel {
  id: string;
  name: string;
  adapter: string;
  description: string;
}

interface InjectionFeature {
  id: InjectionFeatureId;
  title: string;
  description: string;
  recommendedModelIds: string[];
  availableModelIds: string[];
}

interface TargetConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  requestMode: RequestMode;
}

const pipelineSteps: PipelineStep[] = [
  { id: 'target-api', title: '대상 연결', description: 'API key와 Ollama 정보 입력' },
  { id: 'model-select', title: '기능별 모델 선택', description: '인젝션 기능과 평가 모델 매핑' },
  { id: 'run', title: '평가 실행', description: 'Injection 테스트 수행' },
  { id: 'report', title: '결과 확인', description: '성능 평가 리포트 생성' },
];

const evalModels: EvalModel[] = [
  {
    id: 'promptfoo',
    name: 'promptfoo',
    adapter: 'red team adapter',
    description: 'Prompt injection, jailbreak, policy bypass 테스트를 수행합니다.',
  },
  {
    id: 'garak',
    name: 'garak',
    adapter: 'scanner adapter',
    description: 'LLM 취약점 probe와 detector 기반 스캔을 수행합니다.',
  },
  {
    id: 'custom-suite',
    name: 'Custom Injection Suite',
    adapter: 'internal adapter',
    description: '서비스 정책과 Agent 권한 구조에 맞춘 커스텀 케이스를 적용합니다.',
  },
];

const injectionFeatures: InjectionFeature[] = [
  {
    id: 'prompt-injection',
    title: 'Prompt Injection',
    description: '직접 프롬프트 인젝션 payload로 시스템 지시문 우회와 역할 변경을 점검합니다.',
    recommendedModelIds: ['garak', 'promptfoo'],
    availableModelIds: ['promptfoo', 'garak', 'custom-suite'],
  },
  {
    id: 'indirect-injection',
    title: 'Indirect Injection',
    description: '외부 문서, 웹 컨텐츠, RAG context에 숨겨진 지시문을 처리하는 방식을 점검합니다.',
    recommendedModelIds: ['promptfoo'],
    availableModelIds: ['promptfoo', 'custom-suite'],
  },
  {
    id: 'jailbreak',
    title: 'Jailbreak',
    description: '정책 우회, roleplay, encoding 기반 공격에 대한 방어력을 점검합니다.',
    recommendedModelIds: ['promptfoo', 'garak'],
    availableModelIds: ['promptfoo', 'garak'],
  },
  {
    id: 'tool-abuse',
    title: 'Tool Abuse',
    description: 'Agent tool 권한 상승, 민감 액션 실행, 사용자 승인 우회 가능성을 점검합니다.',
    recommendedModelIds: ['custom-suite'],
    availableModelIds: ['custom-suite', 'promptfoo'],
  },
];

const defaultTargetConfig: TargetConfig = {
  apiKey: '',
  baseUrl: 'http://10.30.0.93:11434/api',
  model: 'gpt-oss:20b',
  requestMode: 'chat',
};

const initialFeatureModelSelection: Record<InjectionFeatureId, string[]> = {
  'prompt-injection': ['garak', 'promptfoo'],
  'indirect-injection': [],
  jailbreak: [],
  'tool-abuse': [],
};

function App() {
  const [targetConfig, setTargetConfig] = useState<TargetConfig>(defaultTargetConfig);
  const [targetAccepted, setTargetAccepted] = useState(false);
  const [targetError, setTargetError] = useState('');
  const [selectedModelsByFeature, setSelectedModelsByFeature] = useState<
    Record<InjectionFeatureId, string[]>
  >(initialFeatureModelSelection);
  const [isDark, setIsDark] = useState(true);

  const currentStep: PipelineStepId = targetAccepted ? 'model-select' : 'target-api';
  const selectedFeatureCount = Object.values(selectedModelsByFeature).filter(
    (modelIds) => modelIds.length > 0,
  ).length;
  const selectedModelCount = Object.values(selectedModelsByFeature).reduce(
    (sum, modelIds) => sum + modelIds.length,
    0,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  const maskedKey = useMemo(() => {
    if (!targetAccepted) {
      return 'Not connected';
    }

    const trimmed = targetConfig.apiKey.trim();
    return trimmed.length <= 8 ? 'Connected' : `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }, [targetConfig.apiKey, targetAccepted]);

  const handleTargetSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (targetConfig.apiKey.trim().length < 32) {
      setTargetAccepted(false);
      setTargetError('API key를 32자 이상 입력하세요.');
      return;
    }

    try {
      const parsedUrl = new URL(targetConfig.baseUrl.trim());
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('invalid protocol');
      }
    } catch {
      setTargetAccepted(false);
      setTargetError('Ollama API URL은 http:// 또는 https:// 로 시작해야 합니다.');
      return;
    }

    if (!targetConfig.model.trim()) {
      setTargetAccepted(false);
      setTargetError('Ollama model 이름을 입력하세요.');
      return;
    }

    setTargetAccepted(true);
    setTargetError('');
  };

  const toggleFeature = (id: InjectionFeatureId) => {
    const feature = injectionFeatures.find((item) => item.id === id);
    if (!feature) {
      return;
    }

    setSelectedModelsByFeature((current) => ({
      ...current,
      [id]: current[id].length > 0 ? [] : feature.recommendedModelIds,
    }));
  };

  const toggleFeatureModel = (featureId: InjectionFeatureId, modelId: string) => {
    setSelectedModelsByFeature((current) => {
      const currentModelIds = current[featureId];
      const nextModelIds = currentModelIds.includes(modelId)
        ? currentModelIds.filter((id) => id !== modelId)
        : [...currentModelIds, modelId];

      return {
        ...current,
        [featureId]: nextModelIds,
      };
    });
  };

  return (
    <div className="app-shell">
      <Header isDark={isDark} onToggleTheme={() => setIsDark((value) => !value)} />
      <div className="workspace">
        <PipelineSidebar
          currentStep={currentStep}
          targetAccepted={targetAccepted}
          targetModel={targetConfig.model}
          selectedFeatureCount={selectedFeatureCount}
          selectedModelCount={selectedModelCount}
        />
        <main className="main-panel">
          {!targetAccepted ? (
            <TargetApiStep
              targetConfig={targetConfig}
              error={targetError}
              onTargetConfigChange={setTargetConfig}
              onSubmit={handleTargetSubmit}
            />
          ) : (
            <ModelSelectStep
              maskedKey={maskedKey}
              targetConfig={targetConfig}
              selectedModelsByFeature={selectedModelsByFeature}
              selectedFeatureCount={selectedFeatureCount}
              selectedModelCount={selectedModelCount}
              onToggleFeature={toggleFeature}
              onToggleFeatureModel={toggleFeatureModel}
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
        <span className="brand-mark" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <span className="brand-name">Mohican</span>
          <span className="brand-subtitle">Agent security evaluation</span>
        </div>
      </div>
      <div className="topbar-actions">
        <span className="topbar-status">Local runner</span>
        <button
          className="theme-toggle"
          type="button"
          aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
          onClick={onToggleTheme}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}

function PipelineSidebar({
  currentStep,
  targetAccepted,
  targetModel,
  selectedFeatureCount,
  selectedModelCount,
}: {
  currentStep: PipelineStepId;
  targetAccepted: boolean;
  targetModel: string;
  selectedFeatureCount: number;
  selectedModelCount: number;
}) {
  const currentIndex = pipelineSteps.findIndex((step) => step.id === currentStep);

  return (
    <aside className="pipeline-sidebar" aria-label="Evaluation pipeline">
      <div className="sidebar-header">
        <p className="sidebar-title">Pipeline</p>
        <p className="sidebar-subtitle">현재 평가 진행 단계</p>
      </div>
      <ol className="pipeline-list">
        {pipelineSteps.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const Icon = isComplete ? CheckCircle2 : Circle;

          return (
            <li
              key={step.id}
              className={[
                'pipeline-item',
                isComplete ? 'complete' : '',
                isCurrent ? 'current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="pipeline-marker">
                <Icon size={18} />
              </span>
              <div>
                <strong>{step.title}</strong>
                <span>{step.description}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="pipeline-summary">
        <div>
          <span>API</span>
          <strong>{targetAccepted ? 'Connected' : 'Waiting'}</strong>
        </div>
        <div>
          <span>Target model</span>
          <strong>{targetModel || '-'}</strong>
        </div>
        <div>
          <span>Features</span>
          <strong>{selectedFeatureCount} selected</strong>
        </div>
        <div>
          <span>Model runs</span>
          <strong>{selectedModelCount} configured</strong>
        </div>
      </div>
    </aside>
  );
}

function TargetApiStep({
  targetConfig,
  error,
  onTargetConfigChange,
  onSubmit,
}: {
  targetConfig: TargetConfig;
  error: string;
  onTargetConfigChange: (value: TargetConfig) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const updateTargetConfig = <Key extends keyof TargetConfig>(
    key: Key,
    value: TargetConfig[Key],
  ) => {
    onTargetConfigChange({
      ...targetConfig,
      [key]: value,
    });
  };

  return (
    <section className="page-section narrow" aria-labelledby="target-api-title">
      <div className="section-heading">
        <p className="eyebrow">Target API</p>
        <h1 id="target-api-title">평가 대상 연결 정보</h1>
        <p>
          Mohican API key와 Ollama 서버 정보를 입력하면 다음 단계에서 인젝션 기능별 평가
          모델을 선택합니다.
        </p>
      </div>
      <div className="target-layout">
        <form className="api-key-card" onSubmit={onSubmit}>
          <label className="field">
            <span>Mohican API Key</span>
            <div className="input-shell">
              <KeyRound size={18} />
              <input
                type="password"
                value={targetConfig.apiKey}
                placeholder="64자 이상의 서비스 API key"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => updateTargetConfig('apiKey', event.target.value)}
              />
            </div>
          </label>
          <label className="field">
            <span>Ollama API URL</span>
            <input
              value={targetConfig.baseUrl}
              placeholder="http://10.30.0.93:11434/api"
              spellCheck={false}
              onChange={(event) => updateTargetConfig('baseUrl', event.target.value)}
            />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Ollama Model</span>
              <input
                value={targetConfig.model}
                placeholder="gpt-oss:20b"
                spellCheck={false}
                onChange={(event) => updateTargetConfig('model', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Request Mode</span>
              <select
                value={targetConfig.requestMode}
                onChange={(event) =>
                  updateTargetConfig('requestMode', event.target.value as TargetConfig['requestMode'])
                }
              >
                <option value="chat">Chat /api/chat</option>
                <option value="generate">Generate /api/generate</option>
              </select>
            </label>
          </div>
          {error ? <p className="field-error">{error}</p> : null}
          <button className="primary-button" type="submit">
            다음 단계로
          </button>
        </form>
        <MohicanCharacter modelName={targetConfig.model} />
      </div>
    </section>
  );
}

function MohicanCharacter({ modelName }: { modelName: string }) {
  return (
    <div className="mohican-panel" aria-label="Mohican character">
      <svg className="mohican-figure" viewBox="0 0 520 420" role="img" aria-labelledby="mohican-title">
        <title id="mohican-title">Mohican mascot with animated hair</title>
        <defs>
          <linearGradient id="hairGradient" x1="0%" y1="0%" x2="100%" y2="90%">
            <stop offset="0%" stopColor="#ff5a1f" />
            <stop offset="38%" stopColor="#ff1515" />
            <stop offset="74%" stopColor="#b00012" />
            <stop offset="100%" stopColor="#ff6a1a" />
          </linearGradient>
          <filter id="redGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              result="redBlur"
              type="matrix"
              values="1 0 0 0 0.9 0 0.15 0 0 0 0 0 0.1 0 0 0 0 0 0.6 0"
            />
            <feMerge>
              <feMergeNode in="redBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="hair" filter="url(#redGlow)">
          <polygon className="hair-spike spike-1" points="197,154 98,42 239,187" />
          <polygon className="hair-spike spike-2" points="239,149 185,8 273,190" />
          <polygon className="hair-spike spike-3" points="283,144 279,0 314,188" />
          <polygon className="hair-spike spike-4" points="325,148 374,16 346,190" />
          <polygon className="hair-spike spike-5" points="359,166 438,58 368,206" />
          <polygon className="hair-spike spike-6" points="381,196 499,130 390,230" />
          <polygon className="hair-spike spike-7" points="391,241 512,230 389,265" />
          <polygon className="hair-spike spike-8" points="372,283 474,340 345,305" />
          <path
            className="hair-base"
            d="M199 151 C236 104 327 111 368 172 C405 225 375 292 330 324 C294 350 244 342 214 314 C177 281 169 194 199 151 Z"
          />
        </g>

        <path
          className="head-silhouette"
          d="M197 155 C175 165 163 194 160 222 C158 238 150 247 143 260 L133 278 C128 288 137 298 151 300 L166 302 C172 303 174 309 168 314 L156 323 C147 331 153 346 169 349 L224 349 C253 350 276 367 290 407 L394 407 C382 374 360 347 332 329 C315 318 311 303 311 282 L311 264 C310 245 294 234 270 234 L241 234 L236 212 C232 196 221 185 207 180 C198 177 207 159 197 155 Z"
        />
        <path className="mouth-cut" d="M143 297 C154 306 171 307 186 302" />
        <path className="ear-line" d="M285 222 C307 218 325 239 322 264 C319 290 298 307 281 295" />
        <path className="ear-line inner" d="M292 239 C305 244 307 260 299 274 C294 283 286 288 279 285" />
        <circle className="ear-ring" cx="281" cy="296" r="6" />
        <path className="nose-ring" d="M144 278 C136 279 135 290 144 293 C153 295 158 286 153 280" />
      </svg>
      <div className="mohican-caption">
        <span>MOHICAN TARGET</span>
        <strong>{modelName || 'MODEL WAITING'}</strong>
      </div>
    </div>
  );
}

function ModelSelectStep({
  maskedKey,
  targetConfig,
  selectedModelsByFeature,
  selectedFeatureCount,
  selectedModelCount,
  onToggleFeature,
  onToggleFeatureModel,
}: {
  maskedKey: string;
  targetConfig: TargetConfig;
  selectedModelsByFeature: Record<InjectionFeatureId, string[]>;
  selectedFeatureCount: number;
  selectedModelCount: number;
  onToggleFeature: (id: InjectionFeatureId) => void;
  onToggleFeatureModel: (featureId: InjectionFeatureId, modelId: string) => void;
}) {
  return (
    <section className="page-section" aria-labelledby="model-select-title">
      <div className="section-heading horizontal">
        <div>
          <p className="eyebrow">Injection Features</p>
          <h1 id="model-select-title">인젝션 기능별 모델 선택</h1>
          <p>원하는 인젝션 기능을 켜고, 각 기능에 적용할 평가 모델을 선택하세요.</p>
        </div>
        <div className="connection-badge">
          <KeyRound size={15} />
          {maskedKey} · {targetConfig.model} · /api/{targetConfig.requestMode}
        </div>
      </div>
      <div className="feature-grid">
        {injectionFeatures.map((feature) => {
          const selectedModelIds = selectedModelsByFeature[feature.id];
          const enabled = selectedModelIds.length > 0;

          return (
            <article key={feature.id} className={`feature-card ${enabled ? 'enabled' : ''}`}>
              <button
                type="button"
                className="feature-toggle"
                onClick={() => onToggleFeature(feature.id)}
              >
                <span className="feature-check" aria-hidden="true">
                  {enabled ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </span>
                <span className="feature-copy">
                  <strong>{feature.title}</strong>
                  <span>{feature.description}</span>
                </span>
              </button>
              <div className="model-option-row" aria-label={`${feature.title} models`}>
                {evalModels
                  .filter((model) => feature.availableModelIds.includes(model.id))
                  .map((model) => {
                    const selected = selectedModelIds.includes(model.id);

                    return (
                      <button
                        key={model.id}
                        type="button"
                        className={`model-option ${selected ? 'selected' : ''}`}
                        onClick={() => onToggleFeatureModel(feature.id, model.id)}
                      >
                        <span>{model.name}</span>
                        <small>{model.adapter}</small>
                      </button>
                    );
                  })}
              </div>
            </article>
          );
        })}
      </div>
      <div className="selection-footer">
        <div>
          <Layers3 size={18} />
          <span>
            {selectedFeatureCount}개 기능, {selectedModelCount}개 모델 실행 설정
          </span>
        </div>
        <button className="primary-button" type="button" disabled={selectedModelCount === 0}>
          선택 완료
        </button>
      </div>
    </section>
  );
}

export default App;
