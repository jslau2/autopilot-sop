import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Home from './pages/Home';
import PipelineView from './pages/PipelineView';
import AgentConsole from './pages/AgentConsole';
import Agents from './pages/Agents';
import DataSources from './pages/DataSources';
import BomExplorer from './pages/BomExplorer';
import Compare from './pages/Compare';
import SharePage from './pages/SharePage';
import Schedules from './pages/Schedules';
import Admin from './pages/Admin';
import PlannerChat from './components/PlannerChat';
import NotificationCenter from './components/NotificationCenter';
import SplashScreen from './components/SplashScreen';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  // Public read-only share pages get no app chrome (chat / notifications).
  const isShare = useLocation().pathname.startsWith('/share/');
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('sop-splash-seen'));

  const shouldShowSplash = showSplash && !isShare;

  return (
    <>
      <ScrollToTop />
      {shouldShowSplash && (
        <SplashScreen onComplete={() => {
          sessionStorage.setItem('sop-splash-seen', '1');
          setShowSplash(false);
        }} />
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pipeline" element={<PipelineView />} />
        <Route path="/pipeline/:sessionId" element={<PipelineView />} />
        <Route path="/console" element={<AgentConsole />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/agents/:tab" element={<Agents />} />
        <Route path="/datasources" element={<DataSources />} />
        <Route path="/bom-explorer" element={<BomExplorer />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/admin" element={<Admin />} />
        {/* Renamed config routes → redirect into the merged Agents hub */}
        <Route path="/settings" element={<Navigate to="/agents/configure" replace />} />
        <Route path="/manager" element={<Navigate to="/agents/performance" replace />} />
      </Routes>
      {!isShare && <PlannerChat />}
      {!isShare && <NotificationCenter />}
    </>
  );
}
