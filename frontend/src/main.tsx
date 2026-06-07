import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';

// Rewrite relative /api calls to the configured backend URL (set once in
// localStorage as 'sop-api-url', e.g. http://localhost:8000).
const _fetch = window.fetch.bind(window);
window.fetch = (input, init?) => {
  const base = import.meta.env.VITE_API_URL ?? localStorage.getItem('sop-api-url') ?? '';
  if (base && typeof input === 'string' && input.startsWith('/api')) {
    input = `${base}${input}`;
  }
  return _fetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
