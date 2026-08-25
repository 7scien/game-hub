import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import GameApp from './components/GameApp';
import './globals.css';

const root=document.querySelector('#catan-root');
if(!root)throw new Error('Catan root element was not found');
createRoot(root).render(<StrictMode><GameApp /></StrictMode>);
