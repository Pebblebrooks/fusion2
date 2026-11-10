// Browser entry for the new planner (/app/). The classic planner lives at /app/classic/.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './guided.css';
import GuidedApp from './GuidedApp.jsx';

// Share links made by the classic planner (?p=, ?s=, ?state=) still open there.
const q = new URLSearchParams(window.location.search);
if (q.has('p') || q.has('s') || q.has('state')) {
  window.location.replace(`/app/classic/${window.location.search}`);
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <GuidedApp />
    </StrictMode>,
  );
}
