import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import App from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </StrictMode>
  );
} else {
  document.body.innerHTML = '<div style="min-height:100vh;background:#09090b;color:#fecaca;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:24px;">HashiBot could not start: missing root element. LOGIN_DEBUG_BUILD_MARKER: login-env-proof-v3-no-blank-screen</div>';
}
