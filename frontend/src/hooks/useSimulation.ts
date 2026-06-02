import { useRef, useState, useCallback, useEffect } from 'react';
import type { SimState } from '../types';
import { type SimEvent, PRE_Q1, POST_Q1, buildSimulation, ALL_SPECIALIST_IDS, createInitialState } from '../data/simulation';

function nowTs(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function useSimulation(speed: number = 0.5) {
  const [tick, setTick] = useState(0);
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);

  const S = useRef<SimState & {
    postOffset: number;
    processedPre: Set<number>;
    processedPost: Set<number>;
    done: boolean;
    manualPause: boolean;
    activePre: SimEvent[];
    activePost: SimEvent[];
  }>({
    ...createInitialState(),
    postOffset: 0,
    processedPre: new Set(),
    processedPost: new Set(),
    done: false,
    manualPause: false,
    activePre: PRE_Q1,
    activePost: POST_Q1,
  }).current;

  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  useEffect(() => {
    let last = performance.now();
    let frame = 0;
    let rafId: number;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1) * speedRef.current;
      last = now;

      if (startedRef.current && !S.done && !S.paused && !S.manualPause) {
        S.elapsedT += dt;

        if (S.phase === 'pre') {
          S.activePre.forEach((evt, i) => {
            if (!S.processedPre.has(i) && evt.at <= S.elapsedT) {
              S.processedPre.add(i);
              evt.act(S);
            }
          });
        } else {
          S.postOffset += dt;
          S.activePost.forEach((evt, i) => {
            if (!S.processedPost.has(i) && evt.at <= S.postOffset) {
              S.processedPost.add(i);
              evt.act(S);
            }
          });
        }

        if (S.sessionStatus === 'done') S.done = true;
      }

      frame++;
      if (frame % 3 === 0) setTick(t => t + 1);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const answerQuestion = useCallback((answer: string, rationale = '') => {
    const q = S.pendingQuestion;
    if (!q) return;
    const step = S.steps[q.stepId];
    if (step) {
      step.output = { answer, rationale };
      step.status = 'done';
      step.endT = S.elapsedT;
    }
    S.events.push({
      ts: nowTs(), type: 'answer', agent: 'user',
      message: `↳ Decision: "${answer.slice(0, 80)}${answer.length > 80 ? '…' : ''}"`,
      stepId: q.stepId,
    });
    S.pendingQuestion = null;
    S.paused = false;
    S.phase = 'post';
    S.postOffset = 0;
    setTick(t => t + 1);
  }, []);

  const terminateSession = useCallback(() => {
    S.paused = false;
    S.done = true;
    S.pendingQuestion = null;
    S.sessionStatus = 'done';
    S.events.push({ ts: nowTs(), type: 'log', agent: 'user', message: '⛔ Session terminated by user', stepId: null });
    setTick(t => t + 1);
  }, []);

  const setManualPause = useCallback((v: boolean) => {
    S.manualPause = v;
    setTick(t => t + 1);
  }, []);

  const startSession = useCallback((_goal: string, enabledIds?: Set<string>) => {
    const { pre, post } = buildSimulation(enabledIds ?? ALL_SPECIALIST_IDS);
    S.activePre = pre;
    S.activePost = post;
    startedRef.current = true;
    setStarted(true);
  }, []);

  return {
    tick,
    S,
    started,
    startSession,
    answerQuestion,
    terminateSession,
    setManualPause,
  };
}
