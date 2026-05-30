import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Heuristic cycle name from the goal text. Used as the instant default in the
 * launch config; the user can override it. (Sub-step B adds LLM suggestion.)
 */
export function suggestName(goal: string): string {
  const firstLine = goal.split('\n').map(l => l.trim()).find(Boolean) ?? '';
  const quarter = firstLine.match(/Q[1-4][\s-]?20\d{2}/i)?.[0]?.replace(/\s/, '-');
  const scenario = /surge|disrupt|contingenc|scenario|delay|spike|what[\s-]?if/i.test(goal);
  if (quarter) {
    return `${quarter} S&OP Cycle${scenario ? ' · Scenario' : ''}`;
  }
  // Fall back to the first line, trimmed to a sensible length.
  const trimmed = firstLine.replace(/\s*[—:].*$/, '').slice(0, 50);
  return trimmed || 'New Planning Cycle';
}

/**
 * Permanently delete a cycle (memory + disk). Prompts for confirmation since
 * this is irreversible. Returns true if the user confirmed and it was deleted.
 */
export async function deleteCycle(sessionId: string, name?: string): Promise<boolean> {
  const label = name || sessionId.slice(0, 8);
  if (!window.confirm(`Delete cycle "${label}"? This permanently removes its record and cannot be undone.`)) {
    return false;
  }
  try {
    const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Stop a running/paused cycle but KEEP it: cancels the backend orchestrator +
 * agent tasks and archives the run so it stays reviewable. Returns true if the
 * user confirmed and it was terminated.
 */
export async function terminateCycle(sessionId: string, name?: string): Promise<boolean> {
  const label = name || sessionId.slice(0, 8);
  if (!window.confirm(`Stop cycle "${label}"? It will be halted but kept (archived) so you can still review it.`)) {
    return false;
  }
  try {
    const res = await fetch(`/api/sessions/${sessionId}/terminate`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Creates a cycle and navigates to its run view.
 * - Demo mode: single instance at /pipeline/demo (no backend call).
 * - Live mode: POST /api/sessions, then navigate to /pipeline/:id.
 */
export function useLaunchCycle() {
  const navigate = useNavigate();

  return useCallback(async (demoMode: boolean, goal: string, name: string, opts?: { parentId?: string; entity?: string; uploadId?: string }) => {
    if (demoMode) {
      navigate('/pipeline/demo', { state: { goal, name } });
      return;
    }
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, name, parent_id: opts?.parentId ?? '', entity: opts?.entity ?? '', data_upload_id: opts?.uploadId ?? '' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { session_id } = await res.json();
      navigate(`/pipeline/${session_id}`, { state: { goal, name } });
    } catch (err) {
      // Surface the failure but still route into the run view, where the
      // connection-error banner from useLiveSession will explain the problem.
      console.error('Failed to create session:', err);
      alert('Could not start a live session — is the backend running?');
    }
  }, [navigate]);
}
