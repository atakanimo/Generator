import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// After a deploy, old tabs request chunk hashes that no longer exist: reload once to fetch the new build.
window.addEventListener('vite:preloadError', event => {
  event.preventDefault();
  if (!sessionStorage.getItem('chunk-reload')) {
    sessionStorage.setItem('chunk-reload', '1');
    window.location.reload();
  }
});
window.addEventListener('load', () => sessionStorage.removeItem('chunk-reload'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
