import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OverlayBall from './components/OverlayBall';
import './index.css';
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

const root = ReactDOM.createRoot(rootElement);
const params = new URLSearchParams(window.location.search);

// 核心逻辑：区分是主App还是悬浮窗页面
const isOverlayWindow = params.get('overlay') === '1' || window.location.hash.includes('overlay');

root.render(
  <React.StrictMode>
    {isOverlayWindow ? <OverlayBall /> : <App />}
  </React.StrictMode>
);