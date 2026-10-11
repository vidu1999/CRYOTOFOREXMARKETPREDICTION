import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import { ExtensionWorkspace } from './ui';
import './extension.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ExtensionWorkspace />
  </React.StrictMode>,
);
