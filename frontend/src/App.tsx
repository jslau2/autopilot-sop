import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import PipelineView from './pages/PipelineView';
import AgentConsole from './pages/AgentConsole';
import AgentSettings from './pages/AgentSettings';
import AgentManager from './pages/AgentManager';
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
        <Route path="/settings" element={<AgentSettings />} />
        <Route path="/manager" element={<AgentManager />} />
        <Route path="/datasources" element={<DataSources />} />
      </Routes>
      <PlannerChat />
    </>
  );
}
