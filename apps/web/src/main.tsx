import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import '@fontsource-variable/inter';
import '@fontsource/clarity-city/600.css';
import '@fontsource/clarity-city/700.css';
import '@fontsource/clarity-city/800.css';
import './index.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

