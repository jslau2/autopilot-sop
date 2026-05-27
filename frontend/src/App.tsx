import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import PipelineView from './pages/PipelineView';
import AgentConsole from './pages/AgentConsole';
import AgentSettings from './pages/AgentSettings';
import AgentManager from './pages/AgentManager';
import DataSources from './pages/DataSources';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/pipeline" element={<PipelineView />} />
      <Route path="/console" element={<AgentConsole />} />
      <Route path="/settings" element={<AgentSettings />} />
      <Route path="/manager" element={<AgentManager />} />
      <Route path="/datasources" element={<DataSources />} />
    </Routes>
  );
}
