import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { iniciarMonitoreoConexion } from './services/syncService';

// Iniciar servicio de sincronización offline
iniciarMonitoreoConexion();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
