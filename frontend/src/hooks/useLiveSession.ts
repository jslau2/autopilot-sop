import { useRef, useState, useCallback, useEffect } from 'react';
import type { SimState, Step } from '../types';
import { createInitialState } from '../data/simulation';

function nowTs(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

/** Parse a backend "HH:MM:SS.mmm" timestamp into seconds-of-day. */
function tsToSec(ts: unknown): number | null {
  if (typeof ts !== 'string') return null;
  const m = ts.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
}

type LiveState = SimState & {
  done: boolean;
  manualPause: boolean;
};

/**
 * Connects to an existing backend session by id (created via POST /api/sessions
 * in useLaunchCycle). The SSE endpoint replays full history on connect, then
 * streams live — so switching to any session rebuilds its complete state.
 *
 * Timeline positions are derived from each event's server timestamp (not the
 * connect time), so a resumed/long-running session renders with correct step
 * placement after replay.
 *
 * Background sessions persist: unmounting only closes the EventSource. The
 * backend orchestrator keeps running and is torn down only on explicit
 * terminate (DELETE).
 */
export function useLiveSession(sessionId?: string) {
  const [tick, setTick] = useState(0);
  const started = !!sessionId;

  const S = useRef<LiveState>({
    ...createInitialState(),
    done: false,
    manualPause: false,
  }).current;

  const sessionIdRef = useRef<string | null>(sessionId ?? null);
  const esRef = useRef<EventSource | null>(null);
  const baseSecRef = useRef<number | null>(null);

  /** Timeline seconds for an event, relative to the first event seen. */
  function relTime(evt: Record<string, unknown>): number {
    const sec = tsToSec(evt.ts);
    if (sec == null) return S.elapsedT;
    if (baseSecRef.current == null) baseSecRef.current = sec;
    let t = sec - baseSecRef.current;
    if (t < 0) t += 86400; // wrap past midnight
    return t;
  }

  function applyEvent(evt: Record<string, unknown>) {
    const t = relTime(evt);
    if (t > S.elapsedT) S.elapsedT = t;

    switch (evt.type) {

      case 'step_start': {
        const step: Step = {
          id: evt.step_id as string,
          agent: evt.agent as string,
          label: evt.label as string,
          status: 'running',
          type: 'task',
          startT: t,
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
          step.endT = t;
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
          startT: t,
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

      case 'answer': {
        // Replayed human answer (e.g. on reconnect) — clear any pending pause.
        S.pendingQuestion = null;
        S.paused = false;
        if (S.sessionStatus === 'paused') S.sessionStatus = 'running';
        S.events.push({ ts: nowTs(), type: 'answer', agent: 'user',
          message: `↳ ${evt.message ?? 'Decision recorded'}`, stepId: null });
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

  // Connect to the session's event stream (replay + live). Closing on cleanup
  // does NOT delete the session — it keeps running in the background.
  useEffect(() => {
    if (!sessionId) return;
    sessionIdRef.current = sessionId;
    let cancelled = false;

    const es = new EventSource(`/api/sessions/${sessionId}/events`);
    esRef.current = es;

    es.onmessage = (e) => {
      if (cancelled) return;
      try { applyEvent(JSON.parse(e.data)); } catch { /* malformed event — skip */ }
      setTick(t => t + 1);
    };

    es.onerror = () => {
      if (!S.done) {
        S.events.push({ ts: nowTs(), type: 'log', agent: 'system',
          message: '⚠ Connection error — backend may not be running', stepId: null });
        setTick(t => t + 1);
      }
    };

    return () => {
      cancelled = true;
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const answerQuestion = useCallback((answer: string, rationale = '') => {
    const q = S.pendingQuestion;
    if (!q) return;
    const step = S.steps[q.stepId];
    if (step) {
      step.output = { answer, rationale };
      step.status = 'done';
      step.endT = S.elapsedT;
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
        body: JSON.stringify({ answer, rationale }),
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
      // Terminate keeps the session (archived to disk) for later review.
      fetch(`/api/sessions/${sessionIdRef.current}/terminate`, { method: 'POST' }).catch(() => {});
    }
  }, []);

  const setManualPause = useCallback((v: boolean) => {
    S.manualPause = v;
    setTick(t => t + 1);
    // Live mode: manualPause only pauses the UI (backend continues).
  }, []);

  // startSession kept for API compatibility; creation now happens in
  // useLaunchCycle (POST + navigate), and connection is by sessionId above.
  const startSession = useCallback((_goal: string, _enabledIds?: Set<string>) => { /* no-op — server uses agent_config */ }, []);

  return { tick, S, started, startSession, answerQuestion, terminateSession, setManualPause };
}
