import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 自動破除手機舊版 PWA Service Worker 快取，確保每次部署都能載入最新程式碼
const APP_BUILD_VERSION = '2026.11.06.v2.3';
if (typeof window !== 'undefined') {
  const savedVersion = localStorage.getItem('ynhere_app_version');
  if (savedVersion !== APP_BUILD_VERSION) {
    localStorage.setItem('ynhere_app_version', APP_BUILD_VERSION);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      }).catch(() => {});
    }
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          caches.delete(key);
        }
      }).catch(() => {});
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
