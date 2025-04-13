import React from 'react';
import ReactDOM from 'react-dom/client';
import BalticSeaTracker from './components/BalticSeaTracker';
import './styles/palantir-theme.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BalticSeaTracker />
  </React.StrictMode>
); 