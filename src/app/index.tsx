import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';

window.addEventListener('error', (e) => {
  window.keel?.logRendererError?.({ message: e.message, stack: e.error?.stack });
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason as Error | undefined;
  window.keel?.logRendererError?.({ message: reason?.message || String(e.reason), stack: reason?.stack });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
