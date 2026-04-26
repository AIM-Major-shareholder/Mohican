import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  FileText,
  GripVertical,
  KeyRound,
  Layers3,
  Loader2,
  Moon,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sun,
  Terminal,
  Trash2,
  Trophy,
} from 'lucide-react';

type PipelineStepId = 'target-api' | 'model-select' | 'run' | 'report';
type RequestMode = 'chat' | 'generate';
type EngineId = 'promptfoo' | 'garak' | 'custom-suite';
type InjectionFeatureId =
  | 'prompt-injection'
  | 'indirect-injection'
  | 'jailbreak'
  | 'tool-abuse';
type JobStatus =
  | 'queued'
  | 'preparing'
  | 'generating'
  | 'running'
  | 'parsing'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface PipelineStep {
  id: PipelineStepId;
  title: string;
}

interface EvalModel {
  id: EngineId;
  name: string;
  adapter: string;
  description: string;
}

interface InjectionFeature {
  id: InjectionFeatureId;
  title: string;
  description: string;
  recommendedModelIds: EngineId[];
  availableModelIds: EngineId[];
}

interface ExecutionBlock {
  id: string;
  featureId: InjectionFeatureId;
  engineId: EngineId;
  title: string;
  engineName: string;
  adapter: string;
  description: string;
}

interface TargetConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  requestMode: RequestMode;
}

interface RunOptions {
  numTests: number;
  maxConcurrency: number;
  dryRun: boolean;
}

interface JobProgress {
  phase: JobStatus;
  completed: number;
  total: number;
}

interface EngineState {
  engine: EngineId;
  status: string;
  error?: string;
}

interface JobSnapshot {
  jobId: string;
  status: JobStatus;
  progress: JobProgress;
  engines: EngineState[];
  createdAt: string;
  updatedAt: string;
  resultAvailable: boolean;
}

interface Summary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  riskScore: number;
}

interface Artifact {
  name: string;
  path: string;
  type: string;
}

interface Finding {
  id: string;
  engine: EngineId;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  passed: boolean;
  probe?: string | null;
  plugin?: string | null;
  strategy?: string | null;
  detector?: string | null;
  score?: number | null;
  payload?: string | null;
  response?: string | null;
  evidence?: string | null;
}

interface EngineResult {
  engine: EngineId;
  status: 'completed' | 'failed' | 'skipped' | 'cancelled';
  summary: Summary;
  findings: Finding[];
  artifacts: Artifact[];
  error?: string | null;
}

interface NormalizedResult {
  jobId: string;
  status: JobStatus;
  summary: Summary;
  engineResults: EngineResult[];
  findings: Finding[];
  artifacts: Artifact[];
}

interface HackathonReportModule {
  display_name: string;
  tool: string;
  severity: string;
  total_tested: number;
  vulnerable_count: number;
  details: Array<{
    prompt: string;
    response: string;
    status: string;
  }>;
}

interface HackathonReportData {
  report_info: {
    target_model: string;
    scan_date: string;
    total_modules_run: number;
    overall_severity: string;
  };
  results: Record<string, HackathonReportModule>;
}

type RankSeverity = 'low' | 'medium' | 'high' | 'critical';

interface AttackModuleRank {
  rank: number;
  blockId: string;
  moduleId: string;
  title: string;
  engineName: string;
  moduleType: string;
  score: number;
  severity: RankSeverity;
}

interface RankingCatalogItem {
  id: string;
  featureId: InjectionFeatureId;
  engineId: EngineId;
  title: string;
  moduleType: string;
}

interface JobEvent {
  timestamp: string;
  type: string;
  message?: string | null;
  engine?: EngineId | null;
  stream?: string | null;
}

interface CreateJobResponse {
  jobId: string;
  status: JobStatus;
}

const apiBaseUrl = import.meta.env.VITE_MOHICAN_API_BASE_URL ?? 'http://127.0.0.1:8088';
const pollIntervalMs = 1200;
const terminalStatuses = new Set<JobStatus>(['completed', 'failed', 'cancelled']);

const pipelineSteps: PipelineStep[] = [
  { id: 'target-api', title: '대상 연결' },
  { id: 'model-select', title: '테스트 선택' },
  { id: 'run', title: '평가 실행' },
  { id: 'report', title: '결과 확인' },
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
  baseUrl: 'http://127.0.0.1:11434/api',
  model: 'gpt-oss:20b',
  requestMode: 'chat',
};

const executableEngineIds = new Set<EngineId>(['promptfoo', 'garak']);

const executionBlocks: ExecutionBlock[] = injectionFeatures.flatMap((feature) =>
  feature.availableModelIds
    .filter((engineId) => executableEngineIds.has(engineId))
    .map((engineId) => {
      const engine = evalModels.find((model) => model.id === engineId);

      return {
        id: `${feature.id}:${engineId}`,
        featureId: feature.id,
        engineId,
        title: feature.title,
        engineName: engine?.name ?? engineId,
        adapter: engine?.adapter ?? 'adapter',
        description: feature.description,
      };
    }),
);

const initialExecutionBlockIds = ['prompt-injection:garak', 'prompt-injection:promptfoo'];

const rankingCatalog: RankingCatalogItem[] = [
  {
    id: 'promptfoo:plugin:prompt-extraction',
    featureId: 'prompt-injection',
    engineId: 'promptfoo',
    title: 'prompt-extraction',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:plugin:hijacking',
    featureId: 'prompt-injection',
    engineId: 'promptfoo',
    title: 'hijacking',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:plugin:indirect-prompt-injection:prompt',
    featureId: 'prompt-injection',
    engineId: 'promptfoo',
    title: 'indirect-prompt-injection',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:strategy:prompt-injection',
    featureId: 'prompt-injection',
    engineId: 'promptfoo',
    title: 'prompt-injection',
    moduleType: 'strategy',
  },
  {
    id: 'promptfoo:strategy:base64',
    featureId: 'prompt-injection',
    engineId: 'promptfoo',
    title: 'base64',
    moduleType: 'strategy',
  },
  {
    id: 'garak:probe:promptinject',
    featureId: 'prompt-injection',
    engineId: 'garak',
    title: 'promptinject',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:goodside.Tag',
    featureId: 'prompt-injection',
    engineId: 'garak',
    title: 'goodside.Tag',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:latentinjection',
    featureId: 'prompt-injection',
    engineId: 'garak',
    title: 'latentinjection',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:smuggling',
    featureId: 'prompt-injection',
    engineId: 'garak',
    title: 'smuggling',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:doctor',
    featureId: 'prompt-injection',
    engineId: 'garak',
    title: 'doctor',
    moduleType: 'probe',
  },
  {
    id: 'garak:buff:base64',
    featureId: 'prompt-injection',
    engineId: 'garak',
    title: 'base64',
    moduleType: 'buff',
  },
  {
    id: 'garak:buff:charcode',
    featureId: 'prompt-injection',
    engineId: 'garak',
    title: 'charcode',
    moduleType: 'buff',
  },
  {
    id: 'promptfoo:plugin:indirect-prompt-injection',
    featureId: 'indirect-injection',
    engineId: 'promptfoo',
    title: 'indirect-prompt-injection',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:plugin:rag-document-exfiltration',
    featureId: 'indirect-injection',
    engineId: 'promptfoo',
    title: 'rag-document-exfiltration',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:plugin:rag-poisoning',
    featureId: 'indirect-injection',
    engineId: 'promptfoo',
    title: 'rag-poisoning',
    moduleType: 'plugin',
  },
  {
    id: 'garak:probe:latentinjection:indirect',
    featureId: 'indirect-injection',
    engineId: 'garak',
    title: 'latentinjection',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:web_injection',
    featureId: 'indirect-injection',
    engineId: 'garak',
    title: 'web_injection',
    moduleType: 'probe',
  },
  {
    id: 'promptfoo:plugin:harmbench',
    featureId: 'jailbreak',
    engineId: 'promptfoo',
    title: 'harmbench',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:plugin:harmful',
    featureId: 'jailbreak',
    engineId: 'promptfoo',
    title: 'harmful',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:strategy:jailbreak',
    featureId: 'jailbreak',
    engineId: 'promptfoo',
    title: 'jailbreak',
    moduleType: 'strategy',
  },
  {
    id: 'promptfoo:strategy:crescendo',
    featureId: 'jailbreak',
    engineId: 'promptfoo',
    title: 'crescendo',
    moduleType: 'strategy',
  },
  {
    id: 'promptfoo:strategy:best-of-n',
    featureId: 'jailbreak',
    engineId: 'promptfoo',
    title: 'best-of-n',
    moduleType: 'strategy',
  },
  {
    id: 'promptfoo:strategy:rot13',
    featureId: 'jailbreak',
    engineId: 'promptfoo',
    title: 'rot13',
    moduleType: 'strategy',
  },
  {
    id: 'garak:probe:dan',
    featureId: 'jailbreak',
    engineId: 'garak',
    title: 'dan',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:tap',
    featureId: 'jailbreak',
    engineId: 'garak',
    title: 'tap',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:suffix',
    featureId: 'jailbreak',
    engineId: 'garak',
    title: 'suffix',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:fitd',
    featureId: 'jailbreak',
    engineId: 'garak',
    title: 'fitd',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:dra',
    featureId: 'jailbreak',
    engineId: 'garak',
    title: 'dra',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:grandma',
    featureId: 'jailbreak',
    engineId: 'garak',
    title: 'grandma',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:phrasing',
    featureId: 'jailbreak',
    engineId: 'garak',
    title: 'phrasing',
    moduleType: 'probe',
  },
  {
    id: 'promptfoo:plugin:tool-discovery',
    featureId: 'tool-abuse',
    engineId: 'promptfoo',
    title: 'tool-discovery',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:plugin:excessive-agency',
    featureId: 'tool-abuse',
    engineId: 'promptfoo',
    title: 'excessive-agency',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:plugin:shell-injection',
    featureId: 'tool-abuse',
    engineId: 'promptfoo',
    title: 'shell-injection',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:plugin:ssrf',
    featureId: 'tool-abuse',
    engineId: 'promptfoo',
    title: 'ssrf',
    moduleType: 'plugin',
  },
  {
    id: 'promptfoo:plugin:mcp',
    featureId: 'tool-abuse',
    engineId: 'promptfoo',
    title: 'mcp',
    moduleType: 'plugin',
  },
  {
    id: 'garak:probe:exploitation',
    featureId: 'tool-abuse',
    engineId: 'garak',
    title: 'exploitation',
    moduleType: 'probe',
  },
  {
    id: 'garak:probe:web_injection:tool',
    featureId: 'tool-abuse',
    engineId: 'garak',
    title: 'web_injection',
    moduleType: 'probe',
  },
];

const rankingBlocks: ExecutionBlock[] = Array.from(
  new Map(rankingCatalog.map((item) => [`${item.featureId}:${item.engineId}`, item])).values(),
).map((item) => {
  const feature = injectionFeatures.find((featureItem) => featureItem.id === item.featureId);
  const engine = evalModels.find((model) => model.id === item.engineId);

  return {
    id: `${item.featureId}:${item.engineId}`,
    featureId: item.featureId,
    engineId: item.engineId,
    title: feature?.title ?? item.featureId,
    engineName: engine?.name ?? item.engineId,
    adapter: engine?.adapter ?? 'ranking adapter',
    description: feature?.description ?? '',
  };
});

const defaultRunOptions: RunOptions = {
  numTests: 1,
  maxConcurrency: 1,
  dryRun: false,
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return data as T;
}

function statusLabel(status?: string) {
  switch (status) {
    case 'queued':
      return '대기';
    case 'preparing':
      return '준비';
    case 'generating':
      return '생성';
    case 'running':
      return '실행';
    case 'parsing':
      return '정리';
    case 'completed':
      return '완료';
    case 'failed':
      return '실패';
    case 'cancelled':
      return '취소';
    case 'skipped':
      return '건너뜀';
    default:
      return status || '대기';
  }
}

function formatTime(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatReportDate(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function severityFromSummary(summary: Summary) {
  if (summary.failed > 0 || summary.riskScore >= 0.67) {
    return 'High';
  }
  if (summary.errors > 0 || summary.riskScore >= 0.34) {
    return 'Medium';
  }
  if (summary.riskScore > 0) {
    return 'Low';
  }
  return 'Safe';
}

function toolLabel(engine: EngineId) {
  switch (engine) {
    case 'promptfoo':
      return 'Promptfoo';
    case 'garak':
      return 'Garak';
    default:
      return 'Custom';
  }
}

function stableRankHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 9973;
  }
  return hash;
}

function rankSeverity(score: number): RankSeverity {
  if (score >= 90) {
    return 'critical';
  }
  if (score >= 82) {
    return 'high';
  }
  if (score >= 72) {
    return 'medium';
  }
  return 'low';
}

function buildAttackModuleRanks(block: ExecutionBlock | null): AttackModuleRank[] {
  if (!block) {
    return [];
  }

  const catalogItems = rankingCatalog.filter(
    (item) => item.featureId === block.featureId && item.engineId === block.engineId,
  );
  const rankItems =
    catalogItems.length > 0
      ? catalogItems
      : [
          {
            id: `${block.id}:baseline`,
            featureId: block.featureId,
            engineId: block.engineId,
            title: block.title,
            moduleType: 'block',
          },
        ];

  return rankItems
    .map((item) => {
      const score = 62 + (stableRankHash(`${block.id}:${item.id}`) % 35);
      return {
        rank: 0,
        blockId: block.id,
        moduleId: item.id,
        title: item.title,
        engineName: block.engineName,
        moduleType: item.moduleType,
        score,
        severity: rankSeverity(score),
      };
    })
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
}

function buildHackathonReportData(
  result: NormalizedResult,
  targetConfig: TargetConfig,
  snapshot: JobSnapshot | null,
): HackathonReportData {
  const results = result.engineResults.reduce<Record<string, HackathonReportModule>>(
    (modules, engineResult) => {
      const moduleId = `${engineResult.engine}_evaluation`;
      const vulnerableFindings = engineResult.findings.filter((finding) => !finding.passed);

      modules[moduleId] = {
        display_name: `${toolLabel(engineResult.engine)} - Security Evaluation`,
        tool: toolLabel(engineResult.engine),
        severity: severityFromSummary(engineResult.summary),
        total_tested: engineResult.summary.total,
        vulnerable_count: engineResult.summary.failed,
        details: vulnerableFindings.map((finding) => ({
          prompt: finding.payload || finding.plugin || finding.probe || '-',
          response: finding.response || finding.evidence || finding.detector || '-',
          status: 'VULNERABLE',
        })),
      };

      return modules;
    },
    {},
  );

  return {
    report_info: {
      target_model: targetConfig.model || '-',
      scan_date: formatReportDate(snapshot?.updatedAt),
      total_modules_run: Object.keys(results).length,
      overall_severity: severityFromSummary(result.summary),
    },
    results,
  };
}

function markdownCell(value: string | number) {
  return String(value || '-')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function renderHackathonReportMarkdown(reportData: HackathonReportData) {
  const modules = Object.values(reportData.results);
  const lines = [
    '# LLM 통합 보안 진단 보고서',
    '',
    `**점검 대상 모델:** \`${reportData.report_info.target_model}\`  `,
    `**점검 일시:** \`${reportData.report_info.scan_date}\`  `,
    `**총 실행 모듈 수:** ${reportData.report_info.total_modules_run} 개  `,
    `**종합 위험도:** **${reportData.report_info.overall_severity}**  `,
    '',
    '---',
    '',
    '## 진단 요약',
    '',
    '| 모듈 이름 | 소스(Tool) | 테스트 수 | 취약점 발견 수 | 위험도 | 상태 |',
    '| :--- | :--- | :---: | :---: | :---: | :---: |',
  ];

  for (const moduleData of modules) {
    lines.push(
      `| **${markdownCell(moduleData.display_name)}** | ${markdownCell(moduleData.tool)} | ${moduleData.total_tested} | **${moduleData.vulnerable_count}** | ${moduleData.severity} | ${
        moduleData.vulnerable_count > 0 ? '위험' : '안전'
      } |`,
    );
  }

  if (!modules.length) {
    lines.push('| - | - | 0 | **0** | Safe | 안전 |');
  }

  lines.push('', '---', '', '## 상세 진단 결과', '');

  modules.forEach((moduleData, index) => {
    const rate =
      moduleData.total_tested > 0
        ? Math.round((moduleData.vulnerable_count / moduleData.total_tested) * 1000) / 10
        : null;

    lines.push(
      `### ${index + 1}. ${moduleData.display_name}`,
      `* **소스(Tool):** ${moduleData.tool}`,
      `* **위험도:** ${moduleData.severity}`,
      `* **탐지율:** ${
        rate === null ? '산출 불가' : `${rate}%`
      } (${moduleData.vulnerable_count} / ${moduleData.total_tested})`,
      '',
    );

    if (moduleData.vulnerable_count > 0 && moduleData.details.length > 0) {
      lines.push('| 공격 프롬프트 (Payload) | 모델 응답 (Response) |', '| :--- | :--- |');
      for (const detail of moduleData.details) {
        lines.push(`| \`${markdownCell(detail.prompt)}\` | \`${markdownCell(detail.response)}\` |`);
      }
      lines.push('');
    } else if (moduleData.vulnerable_count > 0) {
      lines.push('> 취약점은 탐지됐지만 상세 payload/response는 결과에 포함되지 않았습니다.', '');
    } else {
      lines.push('> 해당 공격 벡터에 대한 취약점 미발견', '');
    }

    lines.push('---', '');
  });

  if (!modules.length) {
    lines.push('> 출력 가능한 평가 결과가 없습니다.', '');
  }

  lines.push('*보고서 생성 모듈 (Mohican Frontend Export)*');
  return `${lines.join('\n')}\n`;
}

function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function selectedBlocksToFeatureSelection(blocks: ExecutionBlock[]) {
  const selection = injectionFeatures.reduce(
    (accumulator, feature) => ({
      ...accumulator,
      [feature.id]: [],
    }),
    {} as Record<InjectionFeatureId, EngineId[]>,
  );

  for (const block of blocks) {
    if (!selection[block.featureId].includes(block.engineId)) {
      selection[block.featureId].push(block.engineId);
    }
  }

  return selection;
}

function App() {
  const [targetConfig, setTargetConfig] = useState<TargetConfig>(defaultTargetConfig);
  const [targetAccepted, setTargetAccepted] = useState(false);
  const [targetError, setTargetError] = useState('');
  const [selectedExecutionBlockIds, setSelectedExecutionBlockIds] =
    useState<string[]>(initialExecutionBlockIds);
  const [runOptions, setRunOptions] = useState<RunOptions>(defaultRunOptions);
  const [currentStep, setCurrentStep] = useState<PipelineStepId>('target-api');
  const [jobId, setJobId] = useState('');
  const [jobSnapshot, setJobSnapshot] = useState<JobSnapshot | null>(null);
  const [jobResult, setJobResult] = useState<NormalizedResult | null>(null);
  const [jobEvents, setJobEvents] = useState<JobEvent[]>([]);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [runError, setRunError] = useState('');
  const [isDark, setIsDark] = useState(true);

  const selectedBlocks = useMemo(
    () =>
      selectedExecutionBlockIds
        .map((blockId) => executionBlocks.find((block) => block.id === blockId))
        .filter((block): block is ExecutionBlock => Boolean(block)),
    [selectedExecutionBlockIds],
  );
  const selectedModelsByFeature = useMemo(
    () => selectedBlocksToFeatureSelection(selectedBlocks),
    [selectedBlocks],
  );
  const selectedFeatureCount = new Set(selectedBlocks.map((block) => block.featureId)).size;
  const selectedModelCount = selectedBlocks.length;

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  useEffect(() => {
    if (!jobId) {
      return undefined;
    }

    let cancelled = false;

    const pollJob = async () => {
      try {
        const snapshot = await requestJson<JobSnapshot>(`${apiBaseUrl}/api/jobs/${jobId}`);
        if (cancelled) {
          return;
        }

        setJobSnapshot(snapshot);

        if (terminalStatuses.has(snapshot.status) && snapshot.resultAvailable) {
          const result = await requestJson<NormalizedResult>(`${apiBaseUrl}/api/jobs/${jobId}/result`);
          if (!cancelled) {
            setJobResult(result);
            setCurrentStep('report');
          }
        }
      } catch (error) {
        if (!cancelled) {
          setRunError(error instanceof Error ? error.message : 'Job 상태 조회에 실패했습니다.');
        }
      }
    };

    void pollJob();
    const intervalId = window.setInterval(() => void pollJob(), pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      return undefined;
    }

    let active = true;
    setJobEvents([]);
    const source = new EventSource(`${apiBaseUrl}/api/jobs/${jobId}/events`);
    const recordEvent = (event: MessageEvent<string>) => {
      if (!active) {
        return;
      }
      try {
        const parsed = JSON.parse(event.data) as JobEvent;
        setJobEvents((current) => [...current.slice(-39), parsed]);
      } catch {
        setJobEvents((current) => [
          ...current.slice(-39),
          {
            timestamp: new Date().toISOString(),
            type: event.type,
            message: event.data,
          },
        ]);
      }
    };

    for (const eventType of ['status', 'engine-status', 'command', 'log']) {
      source.addEventListener(eventType, recordEvent as EventListener);
    }

    source.onerror = () => {
      source.close();
    };

    return () => {
      active = false;
      source.close();
    };
  }, [jobId]);

  const maskedKey = useMemo(() => {
    if (!targetAccepted) {
      return 'Not connected';
    }

    const trimmed = targetConfig.apiKey.trim();
    return trimmed.length <= 8 ? 'Connected' : `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }, [targetConfig.apiKey, targetAccepted]);

  const handleTargetSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const parsedUrl = new URL(targetConfig.baseUrl.trim());
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('invalid protocol');
      }
    } catch {
      setTargetAccepted(false);
      setTargetError('API URL은 http:// 또는 https:// 로 시작해야 합니다.');
      return;
    }

    if (!targetConfig.model.trim()) {
      setTargetAccepted(false);
      setTargetError('Model 이름을 입력하세요.');
      return;
    }

    setTargetAccepted(true);
    setTargetError('');
    setCurrentStep('model-select');
  };

  const addExecutionBlock = (blockId: string) => {
    setSelectedExecutionBlockIds((current) =>
      current.includes(blockId) ? current : [...current, blockId],
    );
  };

  const removeExecutionBlock = (blockId: string) => {
    setSelectedExecutionBlockIds((current) => current.filter((id) => id !== blockId));
  };

  const moveExecutionBlock = (blockId: string, direction: -1 | 1) => {
    setSelectedExecutionBlockIds((current) => {
      const currentIndex = current.indexOf(blockId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
      return next;
    });
  };

  const handleCreateJob = async () => {
    if (selectedModelCount === 0 || isSubmittingJob) {
      return;
    }

    const selections = injectionFeatures
      .map((feature) => ({
        featureId: feature.id,
        engines: selectedModelsByFeature[feature.id],
      }))
      .filter((selection) => selection.engines.length > 0);

    setIsSubmittingJob(true);
    setRunError('');
    setJobId('');
    setJobSnapshot(null);
    setJobResult(null);
    setJobEvents([]);
    setCurrentStep('run');

    try {
      const response = await requestJson<CreateJobResponse>(`${apiBaseUrl}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: {
            apiKey: targetConfig.apiKey.trim(),
            baseUrl: targetConfig.baseUrl.trim(),
            model: targetConfig.model.trim(),
            requestMode: targetConfig.requestMode,
          },
          selections,
          runOptions: {
            numTests: runOptions.numTests,
            maxConcurrency: runOptions.maxConcurrency,
            dryRun: runOptions.dryRun,
          },
        }),
      });

      setJobId(response.jobId);
      setJobSnapshot({
        jobId: response.jobId,
        status: response.status,
        progress: { phase: response.status, completed: 0, total: selections.length },
        engines: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resultAvailable: false,
      });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Job 생성에 실패했습니다.');
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const handleCancelJob = async () => {
    if (!jobId) {
      return;
    }

    try {
      await requestJson(`${apiBaseUrl}/api/jobs/${jobId}/cancel`, { method: 'POST' });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Job 취소에 실패했습니다.');
    }
  };

  const handleBackToSelection = () => {
    setCurrentStep('model-select');
    setRunError('');
  };

  const handleReset = () => {
    setCurrentStep(targetAccepted ? 'model-select' : 'target-api');
    setJobId('');
    setJobSnapshot(null);
    setJobResult(null);
    setJobEvents([]);
    setRunError('');
    setIsSubmittingJob(false);
  };

  let mainContent;
  if (!targetAccepted || currentStep === 'target-api') {
    mainContent = (
      <TargetApiStep
        targetConfig={targetConfig}
        error={targetError}
        onTargetConfigChange={setTargetConfig}
        onSubmit={handleTargetSubmit}
      />
    );
  } else if (currentStep === 'model-select') {
    mainContent = (
      <ModelSelectStep
        maskedKey={maskedKey}
        targetConfig={targetConfig}
        runOptions={runOptions}
        executionBlocks={executionBlocks}
        selectedBlocks={selectedBlocks}
        selectedExecutionBlockIds={selectedExecutionBlockIds}
        selectedFeatureCount={selectedFeatureCount}
        selectedModelCount={selectedModelCount}
        isSubmittingJob={isSubmittingJob}
        submitError={runError}
        onRunOptionsChange={setRunOptions}
        onAddBlock={addExecutionBlock}
        onRemoveBlock={removeExecutionBlock}
        onMoveBlock={moveExecutionBlock}
        onCreateJob={handleCreateJob}
      />
    );
  } else if (currentStep === 'run') {
    mainContent = (
      <RunStep
        jobId={jobId}
        snapshot={jobSnapshot}
        selectedBlocks={selectedBlocks}
        events={jobEvents}
        error={runError}
        isSubmittingJob={isSubmittingJob}
        onCancel={handleCancelJob}
        onBackToSelection={handleBackToSelection}
      />
    );
  } else {
    mainContent = (
      <ReportStep
        result={jobResult}
        snapshot={jobSnapshot}
        targetConfig={targetConfig}
        events={jobEvents}
        error={runError}
        onBackToSelection={handleReset}
        onRunAgain={handleCreateJob}
      />
    );
  }

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
        <main className="main-panel">{mainContent}</main>
      </div>
    </div>
  );
}

function Header({ isDark, onToggleTheme }: { isDark: boolean; onToggleTheme: () => void }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <img className="brand-logo-image" src="/mohican.png" alt="" />
        </span>
        <div>
          <span className="brand-name">Mohican</span>
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
          <span>Tests</span>
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
        <h1 id="target-api-title">연결 정보</h1>
      </div>
      <div className="target-layout">
        <form className="api-key-card" onSubmit={onSubmit}>
          <label className="field">
            <span>Target API Key</span>
            <div className="input-shell">
              <KeyRound size={18} />
              <input
                type="password"
                value={targetConfig.apiKey}
                placeholder="선택 입력"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => updateTargetConfig('apiKey', event.target.value)}
              />
            </div>
          </label>
          <label className="field">
            <span>API URL</span>
            <input
              value={targetConfig.baseUrl}
              placeholder="http://127.0.0.1:11434/api"
              spellCheck={false}
              onChange={(event) => updateTargetConfig('baseUrl', event.target.value)}
            />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Model</span>
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
      <svg className="mohican-figure" viewBox="0 0 577 432" role="img" aria-labelledby="mohican-title">
        <title id="mohican-title">Animated punk hair Mohican mascot</title>
        <path
          className="punk-hair"
          d="M154 52 L197 174 L221 167 L238 169 L243 176 L240 196 L261 212 L267 238 L281 238 L284 230 L294 218 L304 214 L312 216 L319 222 L326 241 L328 277 L334 286 L352 303 L356 299 L405 324 L411 325 L364 277 L365 275 L440 296 L373 246 L374 244 L458 244 L382 216 L422 195 L458 173 L458 171 L374 181 L429 109 L405 121 L359 151 L357 150 L393 72 L343 136 L342 133 L361 57 L360 51 L312 131 L311 125 L320 39 L288 121 L280 84 L263 29 L260 73 L260 128 L258 130 L208 36 L220 141 Z"
        />

        <path
          className="punk-body"
          d="M199 175 L185 213 L190 231 L171 267 L175 273 L186 275 L190 280 L188 293 L193 297 L191 305 L196 311 L196 335 L207 342 L245 343 L251 349 L254 362 L265 380 L266 386 L259 392 L239 431 L432 431 L416 396 L379 355 L364 343 L351 302 L329 281 L327 251 L318 222 L304 215 L291 222 L281 239 L267 239 L260 212 L239 196 L242 176 L238 170 L221 168 Z"
        />

        <path className="punk-face-line" d="M187 257 C178 263 170 267 174 272" />
        <path className="punk-face-line" d="M179 273 C184 274 188 273 191 270" />
        <path className="punk-face-line" d="M187 286 C196 289 205 288 214 284" />
        <path className="punk-face-line" d="M190 298 C197 301 208 300 218 297" />

        <ellipse cx="303" cy="246" rx="22" ry="31" fill="#020202" stroke="#333" strokeWidth="2" />

        <path className="punk-ear-line" d="M306 222 C293 225 292 238 303 241 C316 245 309 260 294 265" />

        <path className="punk-ear-inner" d="M299 232 C291 239 290 249 296 254" />

        <path className="punk-ear-inner" d="M309 231 C317 242 312 256 300 262" />

        <circle className="punk-piercing" cx="292" cy="269" r="5" />
        <circle cx="290" cy="267" r="2" fill="#fff" />
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
  runOptions,
  executionBlocks,
  selectedBlocks,
  selectedExecutionBlockIds,
  selectedFeatureCount,
  selectedModelCount,
  isSubmittingJob,
  submitError,
  onRunOptionsChange,
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onCreateJob,
}: {
  maskedKey: string;
  targetConfig: TargetConfig;
  runOptions: RunOptions;
  executionBlocks: ExecutionBlock[];
  selectedBlocks: ExecutionBlock[];
  selectedExecutionBlockIds: string[];
  selectedFeatureCount: number;
  selectedModelCount: number;
  isSubmittingJob: boolean;
  submitError: string;
  onRunOptionsChange: (value: RunOptions) => void;
  onAddBlock: (blockId: string) => void;
  onRemoveBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
  onCreateJob: () => void;
}) {
  const updateRunOption = <Key extends keyof RunOptions>(key: Key, value: RunOptions[Key]) => {
    onRunOptionsChange({
      ...runOptions,
      [key]: value,
    });
  };
  const selectedBlockIdSet = new Set(selectedExecutionBlockIds);
  const availableBlocks = executionBlocks.filter((block) => !selectedBlockIdSet.has(block.id));
  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, blockId: string) => {
    event.dataTransfer.setData('text/plain', blockId);
    event.dataTransfer.effectAllowed = 'copy';
  };
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const blockId = event.dataTransfer.getData('text/plain');
    if (executionBlocks.some((block) => block.id === blockId)) {
      onAddBlock(blockId);
    }
  };

  return (
    <section className="page-section" aria-labelledby="model-select-title">
      <div className="section-heading horizontal">
        <div>
          <p className="eyebrow">Execution Blocks</p>
          <h1 id="model-select-title">테스트 선택</h1>
        </div>
        <div className="connection-badge">
          <KeyRound size={15} />
          {maskedKey} · {targetConfig.model} · /api/{targetConfig.requestMode}
        </div>
      </div>
      <div className="block-builder-layout">
        <div className="block-panel">
          <div className="panel-title">
            <Layers3 size={17} />
            <strong>Block Library</strong>
          </div>
          <div className="block-list">
            {availableBlocks.length ? (
              availableBlocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className="test-block library"
                  draggable
                  onDragStart={(event) => handleDragStart(event, block.id)}
                  onClick={() => onAddBlock(block.id)}
                >
                  <span className="block-grip" aria-hidden="true">
                    <GripVertical size={16} />
                  </span>
                  <span className="block-copy">
                    <strong>{block.title}</strong>
                    <small>{block.engineName} · {block.adapter}</small>
                  </span>
                  <span className="block-action" aria-hidden="true">
                    <Plus size={16} />
                  </span>
                </button>
              ))
            ) : (
              <div className="empty-state">모든 실행 블럭이 배치되었습니다.</div>
            )}
          </div>
        </div>

        <div
          className="block-panel execution"
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
        >
          <div className="panel-title">
            <Play size={17} />
            <strong>Execution Stack</strong>
          </div>
          <div className="block-list arranged">
            {selectedBlocks.length ? (
              selectedBlocks.map((block, index) => (
                <div key={block.id} className="test-block arranged">
                  <span className="block-order">{index + 1}</span>
                  <span className="block-copy">
                    <strong>{block.title}</strong>
                    <small>{block.engineName} · block당 1회</small>
                  </span>
                  <span className="block-controls">
                    <button
                      type="button"
                      aria-label={`${block.title} 위로 이동`}
                      disabled={index === 0}
                      onClick={() => onMoveBlock(block.id, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${block.title} 아래로 이동`}
                      disabled={index === selectedBlocks.length - 1}
                      onClick={() => onMoveBlock(block.id, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${block.title} 제거`}
                      onClick={() => onRemoveBlock(block.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
              ))
            ) : (
              <div className="empty-state">실행할 블럭을 이 영역에 배치하세요.</div>
            )}
          </div>
        </div>
      </div>

      <AttackRankingPanel blocks={rankingBlocks} />

      <div className="run-control-panel" aria-label="Run options">
        <label className="option-toggle">
          <input
            type="checkbox"
            checked={runOptions.dryRun}
            onChange={(event) => updateRunOption('dryRun', event.target.checked)}
          />
          <span>Dry run · config만 생성</span>
        </label>
        <div className="demo-limit">
          <span>Demo mode</span>
          <strong>1 attack per block · concurrency 1</strong>
        </div>
      </div>
      {submitError ? <p className="error-banner">{submitError}</p> : null}
      <div className="selection-footer">
        <div>
          <Layers3 size={18} />
          <span>
            {selectedFeatureCount}개 기능, {selectedModelCount}개 엔진 실행 설정
          </span>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={selectedModelCount === 0 || isSubmittingJob}
          onClick={onCreateJob}
        >
          <Play size={16} />
          {isSubmittingJob ? '요청 중' : '선택 완료'}
        </button>
      </div>
    </section>
  );
}

function RunStep({
  jobId,
  snapshot,
  selectedBlocks,
  events,
  error,
  isSubmittingJob,
  onCancel,
  onBackToSelection,
}: {
  jobId: string;
  snapshot: JobSnapshot | null;
  selectedBlocks: ExecutionBlock[];
  events: JobEvent[];
  error: string;
  isSubmittingJob: boolean;
  onCancel: () => void;
  onBackToSelection: () => void;
}) {
  const status = snapshot?.status ?? (isSubmittingJob ? 'queued' : 'preparing');
  const progressTotal = snapshot?.progress.total ?? 0;
  const progressCompleted = snapshot?.progress.completed ?? 0;
  const progressValue = progressTotal > 0 ? Math.min(100, (progressCompleted / progressTotal) * 100) : 18;
  const canCancel = Boolean(jobId) && !terminalStatuses.has(status);
  const engineStates = snapshot?.engines ?? [];
  const blockStates = selectedBlocks.map((block) => {
    const engineState = engineStates.find((item) => item.engine === block.engineId);
    return {
      block,
      status: engineState?.status ?? status,
      error: engineState?.error,
    };
  });

  return (
    <section className="page-section" aria-labelledby="run-title">
      <div className="section-heading horizontal">
        <div>
          <p className="eyebrow">Run</p>
          <h1 id="run-title">평가 실행</h1>
        </div>
        <div className={`status-pill ${status}`}>
          {terminalStatuses.has(status) ? <CheckCircle2 size={15} /> : <Loader2 size={15} />}
          {statusLabel(status)}
        </div>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="run-layout">
        <div className="run-panel">
          <div className="run-panel-header">
            <div>
              <span>Job</span>
              <strong>{jobId || 'creating'}</strong>
            </div>
            <div>
              <span>Updated</span>
              <strong>{formatTime(snapshot?.updatedAt)}</strong>
            </div>
          </div>
          <div className="progress-track" aria-label="Job progress">
            <span style={{ width: `${progressValue}%` }} />
          </div>
          <div className="engine-status-list">
            {blockStates.length ? (
              blockStates.map(({ block, status: blockStatus, error: blockError }) => (
                <div key={block.id} className="engine-status-item">
                  <span className="block-status-copy">
                    <strong>{block.title}</strong>
                    <small>{block.engineName} · block당 1회</small>
                  </span>
                  <strong>{statusLabel(blockStatus)}</strong>
                  {blockError ? <small className="status-error">{blockError}</small> : null}
                </div>
              ))
            ) : (
              <div className="empty-state">Block 상태를 기다리는 중입니다.</div>
            )}
          </div>
          <div className="inline-actions">
            <button className="secondary-button" type="button" onClick={onBackToSelection}>
              <RotateCcw size={16} />
              선택 수정
            </button>
            <button className="danger-button" type="button" disabled={!canCancel} onClick={onCancel}>
              중지
            </button>
          </div>
        </div>

        <div className="run-panel">
          <div className="panel-title">
            <Terminal size={17} />
            <strong>Events</strong>
          </div>
          <div className="event-log" aria-live="polite">
            {events.length ? (
              events.slice(-14).map((event, index) => (
                <div key={`${event.timestamp}-${index}`} className="event-row">
                  <span>{formatTime(event.timestamp)}</span>
                  <strong>{event.engine || event.type}</strong>
                  <p>{event.message || event.type}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">이벤트 스트림을 기다리는 중입니다.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AttackRankingPanel({ blocks }: { blocks: ExecutionBlock[] }) {
  const [activeBlockId, setActiveBlockId] = useState(blocks[0]?.id ?? '');
  const activeBlock = blocks.find((block) => block.id === activeBlockId) ?? blocks[0] ?? null;
  const ranks = useMemo(() => buildAttackModuleRanks(activeBlock), [activeBlock]);
  const podiumRanks = [ranks[1], ranks[0], ranks[2]].filter(
    (rank): rank is AttackModuleRank => Boolean(rank),
  );

  useEffect(() => {
    if (!blocks.length) {
      setActiveBlockId('');
      return;
    }
    if (!blocks.some((block) => block.id === activeBlockId)) {
      setActiveBlockId(blocks[0].id);
    }
  }, [activeBlockId, blocks]);

  return (
    <div className="report-panel ranking-panel">
      <div className="panel-title">
        <Trophy size={17} />
        <strong>Attack Module Ranking</strong>
      </div>

      {blocks.length ? (
        <>
          <div className="ranking-block-tabs" aria-label="Ranking blocks">
            {blocks.map((block) => (
              <button
                key={block.id}
                type="button"
                className={block.id === activeBlock?.id ? 'active' : ''}
                onClick={() => setActiveBlockId(block.id)}
              >
                <strong>{block.title}</strong>
                <span>{block.engineName}</span>
              </button>
            ))}
          </div>

          <div className={`podium-grid count-${podiumRanks.length}`} aria-label="Top 3 attack modules">
            {podiumRanks.map((rank) => (
              <div key={rank.moduleId} className={`podium-card rank-${rank.rank}`}>
                <span className="podium-position">#{rank.rank}</span>
                <div className="podium-avatar">
                  <img src="/mohican.png" alt="" aria-hidden="true" />
                </div>
                <strong>{rank.title}</strong>
                <span>
                  {rank.engineName} · {rank.moduleType}
                </span>
                <b>{rank.score}</b>
              </div>
            ))}
          </div>

          <div className="rank-table" role="table" aria-label="Attack module score ranking">
            <div className="rank-row header" role="row">
              <span role="columnheader">Rank</span>
              <span role="columnheader">Attack Module</span>
              <span role="columnheader">Type</span>
              <span role="columnheader">Score</span>
            </div>
            {ranks.map((rank) => (
              <div key={rank.moduleId} className="rank-row" role="row">
                <strong role="cell">#{rank.rank}</strong>
                <span role="cell">{rank.title}</span>
                <span role="cell">{rank.moduleType}</span>
                <b className={`rank-score ${rank.severity}`} role="cell">
                  {rank.score}
                </b>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">순위 산출 대상이 없습니다.</div>
      )}
    </div>
  );
}

function ReportStep({
  result,
  snapshot,
  targetConfig,
  events,
  error,
  onBackToSelection,
  onRunAgain,
}: {
  result: NormalizedResult | null;
  snapshot: JobSnapshot | null;
  targetConfig: TargetConfig;
  events: JobEvent[];
  error: string;
  onBackToSelection: () => void;
  onRunAgain: () => void;
}) {
  const summary = result?.summary ?? {
    total: 0,
    passed: 0,
    failed: 0,
    errors: 0,
    riskScore: 0,
  };
  const reportMarkdown = useMemo(() => {
    if (!result) {
      return '';
    }
    return renderHackathonReportMarkdown(buildHackathonReportData(result, targetConfig, snapshot));
  }, [result, snapshot, targetConfig]);
  const handleDownloadReport = () => {
    if (!result || !reportMarkdown) {
      return;
    }
    downloadText(`${result.jobId}_report.md`, reportMarkdown, 'text/markdown');
  };

  return (
    <section className="page-section" aria-labelledby="report-title">
      <div className="section-heading horizontal">
        <div>
          <p className="eyebrow">Report</p>
          <h1 id="report-title">결과 확인</h1>
        </div>
        <div className={`status-pill ${result?.status || snapshot?.status || 'completed'}`}>
          <FileText size={15} />
          {statusLabel(result?.status || snapshot?.status)}
        </div>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="summary-grid">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="Passed" value={summary.passed} />
        <SummaryCard label="Failed" value={summary.failed} />
        <SummaryCard label="Errors" value={summary.errors} />
        <SummaryCard label="Risk" value={formatPercent(summary.riskScore)} />
      </div>

      <div className="report-layout">
        <div className="report-panel">
          <div className="panel-title">
            <Layers3 size={17} />
            <strong>Engine Results</strong>
          </div>
          <div className="engine-result-list">
            {result?.engineResults.length ? (
              result.engineResults.map((engineResult) => (
                <div key={engineResult.engine} className="engine-result-card">
                  <div>
                    <strong>{engineResult.engine}</strong>
                    <span>{statusLabel(engineResult.status)}</span>
                  </div>
                  <small>
                    total {engineResult.summary.total} · failed {engineResult.summary.failed} · errors{' '}
                    {engineResult.summary.errors}
                  </small>
                  {engineResult.error ? <p>{engineResult.error}</p> : null}
                </div>
              ))
            ) : (
              <div className="empty-state">결과를 불러오는 중입니다.</div>
            )}
          </div>
        </div>

        <div className="report-panel">
          <div className="panel-title">
            <AlertTriangle size={17} />
            <strong>Findings</strong>
          </div>
          <div className="finding-list">
            {result?.findings.length ? (
              result.findings.slice(0, 12).map((finding) => (
                <div key={finding.id} className={`finding-card ${finding.severity}`}>
                  <div>
                    <strong>{finding.category}</strong>
                    <span>{finding.engine}</span>
                  </div>
                  <p>{finding.evidence || finding.detector || finding.plugin || 'failed assertion'}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">등록된 finding이 없습니다.</div>
            )}
          </div>
        </div>
      </div>

      <div className="report-panel artifact-panel">
        <div className="panel-title">
          <FileText size={17} />
          <strong>Artifacts</strong>
        </div>
        <div className="artifact-list">
          {result?.artifacts.length ? (
            result.artifacts.map((artifact) => (
              <div key={`${artifact.type}-${artifact.path}`} className="artifact-row">
                <strong>{artifact.type}</strong>
                <span>{artifact.path}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">artifact가 아직 없습니다.</div>
          )}
        </div>
      </div>

      <div className="selection-footer">
        <div>
          <Terminal size={18} />
          <span>이벤트 {events.length}개 수신</span>
        </div>
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={onBackToSelection}>
            <RotateCcw size={16} />
            선택 수정
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!result}
            onClick={handleDownloadReport}
          >
            <FileText size={16} />
            보고서 다운로드
          </button>
          <button className="primary-button" type="button" onClick={onRunAgain}>
            <RefreshCw size={16} />
            다시 실행
          </button>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;
