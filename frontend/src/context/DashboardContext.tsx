import { createContext, useContext } from 'react';
import type { Step, SimEvent, KPIs, SessionStatus } from '../types';
import type { UploadSeed } from '../components/DataUpload';

export interface DashboardContextValue {
  steps: Record<string, Step>;
  stepsArr: Step[];
  events: SimEvent[];
  elapsedT: number;
  pendingQuestion: { stepId: string; text: string } | null;
  sessionStatus: SessionStatus;
  selectedStepId: string | null;
  setSelectedStepId: (id: string | null) => void;
  viewMode: 'swimlane' | 'timeline';
  setViewMode: (v: 'swimlane' | 'timeline') => void;
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  demoMode: boolean;
  onNewCycle: (seed?: UploadSeed) => void;
  kpis: KPIs;
  paused: boolean;
  manualPause: boolean;
  setManualPause: (v: boolean) => void;
  answerQuestion: (answer: string, rationale?: string) => void;
  terminateSession: () => void;
  showTour: boolean;
  setShowTour: (v: boolean) => void;
}

export const DashboardContext = createContext<DashboardContextValue>({
  steps: {},
  stepsArr: [],
  events: [],
  elapsedT: 0,
  pendingQuestion: null,
  sessionStatus: 'running',
  selectedStepId: null,
  setSelectedStepId: () => {},
  viewMode: 'swimlane',
  setViewMode: () => {},
  activeSessionId: 'sess-001',
  setActiveSessionId: () => {},
  demoMode: true,
  onNewCycle: () => {},
  kpis: { otif: null, forecastAcc: null, capacityUtil: null, wos: null, planDelta: null },
  paused: false,
  manualPause: false,
  setManualPause: () => {},
  answerQuestion: () => {},
  terminateSession: () => {},
  showTour: false,
  setShowTour: () => {},
});

export function useDashboard() {
  return useContext(DashboardContext);
}
