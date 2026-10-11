import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import ExtensionPreview from './extension/Preview';
import './extension/extension.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ExtensionPreview />
  </React.StrictMode>,
);
