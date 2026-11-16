// Browser entry for Fusion Studio (/app/studio/). Workspace and Adviser only; see StudioApp.jsx.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './studio.css';
import StudioApp from './StudioApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StudioApp />
  </StrictMode>,
);
