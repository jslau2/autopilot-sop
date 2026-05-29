import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import PipelineView from './pages/PipelineView';
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
        <Route path="/agents" element={<Agents />} />
        <Route path="/agents/:tab" element={<Agents />} />
        <Route path="/datasources" element={<DataSources />} />
        {/* Retired/renamed routes → redirect to the new structure */}
        <Route path="/settings" element={<Navigate to="/agents/configure" replace />} />
        <Route path="/manager" element={<Navigate to="/agents/performance" replace />} />
        <Route path="/console" element={<Navigate to="/" replace />} />
      </Routes>
      <PlannerChat />
    </>
  );
}
