import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import PipelineView from './pages/PipelineView';
import AgentConsole from './pages/AgentConsole';
import Agents from './pages/Agents';
import DataSources from './pages/DataSources';
import PlannerChat from './components/PlannerChat';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pipeline" element={<PipelineView />} />
        <Route path="/pipeline/:sessionId" element={<PipelineView />} />
        <Route path="/console" element={<AgentConsole />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/agents/:tab" element={<Agents />} />
        <Route path="/datasources" element={<DataSources />} />
        {/* Renamed config routes → redirect into the merged Agents hub */}
        <Route path="/settings" element={<Navigate to="/agents/configure" replace />} />
        <Route path="/manager" element={<Navigate to="/agents/performance" replace />} />
      </Routes>
      <PlannerChat />
    </>
  );
}
