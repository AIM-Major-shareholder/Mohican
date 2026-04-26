import type { LucideIcon } from 'lucide-react';

export type StepId = 'target' | 'modules' | 'run' | 'report';

export interface Step {
  id: StepId;
  label: string;
  icon: LucideIcon;
}

export interface TargetConfig {
  name: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  authHeader: string;
  apiKey: string;
  model: string;
  timeout: number;
  stateful: boolean;
}

export interface EvalModule {
  id: string;
  name: string;
  adapter: string;
  description: string;
  tests: number;
  coverage: string[];
  status: 'ready' | 'configured' | 'disabled';
  enabled: boolean;
}

export interface Finding {
  id: string;
  title: string;
  module: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  prompt: string;
  response: string;
}

export interface ReportMetric {
  label: string;
  value: number;
  delta: string;
  tone: 'good' | 'warn' | 'bad';
}
