import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App.js';

try {
  const savedTheme = localStorage.getItem('ghostslate-theme');
  document.documentElement.dataset.theme =
    savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
