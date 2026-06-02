export type StepStatus = 'running' | 'paused' | 'done';
export type AgentStatus = 'running' | 'paused' | 'done' | 'idle';
export type SessionStatus = 'running' | 'paused' | 'done';

export interface Step {
  id: string;
  agent: string;
  label: string;
  status: StepStatus;
  type: 'task' | 'question';
  startT: number;
  endT: number | null;
  deps: string[];
  records: number;
  metrics: Record<string, string> | null;
  output: Record<string, unknown> | null;
  question: { text: string } | null;
  dataSource?: string;
}

export interface SimEvent {
  ts: string;
  type: 'start' | 'done' | 'log' | 'question' | 'answer' | 'terminate';
  agent: string;
  message: string;
  stepId: string | null;
}

export interface KPIs {
  otif: string | null;
  forecastAcc: string | null;
  capacityUtil: string | null;
  wos: string | null;
  planDelta: number | null;
}

export interface SimState {
  steps: Record<string, Step>;
  events: SimEvent[];
  kpis: KPIs;
  pendingQuestion: { stepId: string; text: string } | null;
  paused: boolean;
  manualPause: boolean;
  sessionStatus: SessionStatus;
  elapsedT: number;
  phase: 'pre' | 'post';
  postOffset: number;
  nextPreIdx: number;
  nextPostIdx: number;
  activeAgents?: string[];   // specialist agents in scope for this run (live mode); empty = show all
}

export interface Agent {
  id: string;
  name: string;
  sub: string;
  color: string;
  rawColor: string;
  code: string;
  llm?: boolean;
}
