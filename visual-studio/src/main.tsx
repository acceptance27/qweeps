import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './theme/theme.css';
import { initializeTheme } from './theme/themes';

initializeTheme();
createRoot(document.getElementById('root')!).render(<App />);
