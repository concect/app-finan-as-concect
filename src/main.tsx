import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { FeedbackProvider } from './contexts/FeedbackContext';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </React.StrictMode>
  );
}
