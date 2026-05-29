import { useRef, useState, useCallback, useEffect } from 'react';
import type { SimState, Step } from '../types';
import { createInitialState } from '../data/simulation';

function nowTs(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

type LiveState = SimState & {
  done: boolean;
  manualPause: boolean;
};

export function useLiveSession(enabled: boolean = true) {
  const [tick, setTick] = useState(0);
  const [started, setStarted] = useState(false);

  const S = useRef<LiveState>({
    ...createInitialState(),
    done: false,
    manualPause: false,
  }).current;

  const sessionIdRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const startTimeRef = useRef<number>(performance.now());

  function applyEvent(evt: Record<string, unknown>) {
    switch (evt.type) {

      case 'step_start': {
        const step: Step = {
          id: evt.step_id as string,
          agent: evt.agent as string,
          label: evt.label as string,
          status: 'running',
          type: 'task',
          startT: (performance.now() - startTimeRef.current) / 1000,
          endT: null,
          deps: (evt.deps as string[]) ?? [],
          records: 0,
          metrics: null,
          output: null,
          question: null,
          dataSource: (evt.data_source as string) || undefined,
        };
        S.steps[step.id] = step;
        S.events.push({ ts: nowTs(), type: 'start', agent: step.agent,
          message: `▶ ${step.label}`, stepId: step.id });
        break;
      }

      case 'step_complete': {
        const step = S.steps[evt.step_id as string];
        if (step) {
          step.status = 'done';
          step.endT = (performance.now() - startTimeRef.current) / 1000;
          step.output = (evt.output as Record<string, unknown>) ?? null;
          step.metrics = (evt.metrics as Record<string, string>) ?? null;
          step.records = (evt.records as number) ?? 0;
        }
        S.events.push({ ts: nowTs(), type: 'done', agent: evt.agent as string,
          message: `✓ ${evt.message}`, stepId: evt.step_id as string });
        break;
      }

      case 'log': {
        S.events.push({ ts: nowTs(), type: 'log', agent: evt.agent as string,
          message: evt.message as string, stepId: null });
        break;
      }

      case 'kpi_update': {
        const key = evt.key as keyof typeof S.kpis;
        if (key === 'planDelta') {
          S.kpis.planDelta = parseFloat(String(evt.value).replace(/[^0-9.-]/g, '')) || null;
        } else {
          (S.kpis as unknown as Record<string, string | null>)[key] = evt.value as string;
        }
        break;
      }

      case 'question': {
        const stepId = evt.step_id as string;
        const step: Step = {
          id: stepId,
          agent: evt.agent as string,
          label: evt.label as string,
          status: 'paused',
          type: 'question',
          startT: (performance.now() - startTimeRef.current) / 1000,
          endT: null,
          deps: [],
          records: 0,
          metrics: null,
          output: null,
          question: { text: evt.text as string },
        };
        S.steps[stepId] = step;
        S.pendingQuestion = { stepId, text: evt.text as string };
        S.paused = true;
        S.sessionStatus = 'paused';
        S.events.push({ ts: nowTs(), type: 'question', agent: step.agent,
          message: '⏸ Pipeline paused — decision required', stepId });
        break;
      }

      case 'session_complete': {
        S.sessionStatus = 'done';
        S.done = true;
        S.paused = false;
        const summary = (evt.summary as string) ?? 'Planning cycle complete';
        S.events.push({ ts: nowTs(), type: 'done', agent: 'planner',
          message: `✓ ${summary}`, stepId: null });
        esRef.current?.close();
        break;
      }

      case 'error': {
        S.events.push({ ts: nowTs(), type: 'log', agent: evt.agent as string,
          message: `⚠ ${evt.message}`, stepId: null });
        break;
      }
    }
  }

  const startSession = useCallback(async (goal: string) => {
    if (!enabled) return;
    setStarted(true);
    startTimeRef.current = performance.now();

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { session_id } = await res.json();

      sessionIdRef.current = session_id;

      const es = new EventSource(`/api/sessions/${session_id}/events`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          applyEvent(evt);
        } catch { /* malformed event — skip */ }
        S.elapsedT = (performance.now() - startTimeRef.current) / 1000;
        setTick(t => t + 1);
      };

      es.onerror = () => {
        if (!S.done) {
          S.events.push({ ts: nowTs(), type: 'log', agent: 'system',
            message: '⚠ Connection error — backend may not be running', stepId: null });
          setTick(t => t + 1);
        }
      };
    } catch (err) {
      S.events.push({ ts: nowTs(), type: 'log', agent: 'system',
        message: `⚠ Failed to start session: ${err instanceof Error ? err.message : String(err)}`,
        stepId: null });
      setTick(t => t + 1);
    }
  }, [enabled]);

  useEffect(() => {
    return () => {
      esRef.current?.close();
      if (sessionIdRef.current) {
        fetch(`/api/sessions/${sessionIdRef.current}`, { method: 'DELETE' }).catch(() => {});
      }
    };
  }, []);

  const answerQuestion = useCallback((answer: string) => {
    const q = S.pendingQuestion;
    if (!q) return;
    const step = S.steps[q.stepId];
    if (step) {
      step.output = { answer };
      step.status = 'done';
      step.endT = (performance.now() - startTimeRef.current) / 1000;
    }
    S.events.push({ ts: nowTs(), type: 'answer', agent: 'user',
      message: `↳ Decision: "${answer.slice(0, 80)}${answer.length > 80 ? '…' : ''}"`,
      stepId: q.stepId });
    S.pendingQuestion = null;
    S.paused = false;
    S.sessionStatus = 'running';
    setTick(t => t + 1);

    if (sessionIdRef.current) {
      fetch(`/api/sessions/${sessionIdRef.current}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      }).catch(err => console.error('Failed to send answer:', err));
    }
  }, []);

  const terminateSession = useCallback(() => {
    S.paused = false;
    S.done = true;
    S.pendingQuestion = null;
    S.sessionStatus = 'done';
    S.events.push({ ts: nowTs(), type: 'log', agent: 'user',
      message: '⛔ Session terminated by user', stepId: null });
    setTick(t => t + 1);
    esRef.current?.close();
    if (sessionIdRef.current) {
      fetch(`/api/sessions/${sessionIdRef.current}`, { method: 'DELETE' }).catch(() => {});
    }
  }, []);

  const setManualPause = useCallback((v: boolean) => {
    S.manualPause = v;
    setTick(t => t + 1);
    // Live mode: manualPause only pauses the UI (backend continues)
    // Full pause/resume of backend would require additional endpoints
  }, []);

  return { tick, S, started, startSession, answerQuestion, terminateSession, setManualPause };
}
