import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import ExtensionOptions from './options';
import './extension.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ExtensionOptions />
  </React.StrictMode>,
);
