import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

// Any cover/artwork that fails to load (offline, expired link, blocked host) falls back to the SURDHARA placeholder
// once, instead of leaving a broken-image icon. `error` does not bubble, so listen in the capture phase.
document.addEventListener('error', (event) => {
  const image = event.target;
  if (image?.tagName !== 'IMG' || image.dataset.fallbackApplied) return;
  image.dataset.fallbackApplied = 'true';
  image.src = '/local-audio-cover.svg';
}, true);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
