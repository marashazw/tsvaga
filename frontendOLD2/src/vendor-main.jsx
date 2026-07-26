import React from 'react';
import ReactDOM from 'react-dom/client';
import VendorApp from './VendorApp.jsx';
import './styles.css';
import './vendor-styles.css';
import { registerServiceWorker } from './registerServiceWorker.js';

registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <VendorApp />
  </React.StrictMode>
);
