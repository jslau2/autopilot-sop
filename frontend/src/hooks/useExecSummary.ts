import { useState, useEffect } from 'react';
import type { ReportData } from '../lib/report';
import { heuristicExecSummary } from '../lib/report';

/**
 * Resolve a 3-sentence executive summary for a run. In live mode it asks the
 * backend (LLM) endpoint; in demo / offline it computes a heuristic from the
 * already-built ReportData. Returns the summary, its source, and loading state.
 */
export function useExecSummary(
  report: ReportData,
  opts: { sessionId?: string; demoMode?: boolean; enabled?: boolean },
) {
  const { sessionId, demoMode, enabled = true } = opts;
  const [summary, setSummary] = useState<string>('');
  const [source, setSource] = useState<'llm' | 'fallback' | 'heuristic'>('heuristic');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    // Demo / no backend session → heuristic immediately.
    if (demoMode || !sessionId) {
      setSummary(heuristicExecSummary(report));
      setSource('heuristic');
      return;
    }
    let alive = true;
    setLoading(true);
    // Show the heuristic instantly, then upgrade to the LLM result when it lands.
    setSummary(heuristicExecSummary(report));
    fetch(`/api/sessions/${sessionId}/exec-summary`, { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d) return;
        if (d.summary) { setSummary(d.summary); setSource(d.source === 'llm' ? 'llm' : 'fallback'); }
      })
      .catch(() => { /* keep heuristic */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, demoMode, enabled]);

  return { summary, source, loading };
}
