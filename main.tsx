import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {LanguageProvider} from './lib/language';
import './style.css';
import './lab.css';
import './design.css';
import './studio.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><LanguageProvider><App/></LanguageProvider></React.StrictMode>);
