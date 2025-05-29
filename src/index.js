import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 서비스 워커 초기화
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // 기존 서비스 워커 제거
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let registration of registrations) {
        await registration.unregister();
      }

      // 캐시 스토리지 모두 삭제
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(key => caches.delete(key)));

      // 새로운 서비스 워커 등록
      const registration = await navigator.serviceWorker.register('/service-worker.js?v=1.0.4', {
        updateViaCache: 'none'
      });

      // 즉시 업데이트 체크
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  });

  // 서비스 워커 업데이트 감지
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
} 