import './styles.css';
import { App } from './app/App';
import { inject } from '@vercel/analytics';

const appRoot = document.getElementById('app');

if (!appRoot) {
  throw new Error('Missing #app root element');
}

const app = new App(appRoot);
void app.mount();

// Inject Vercel Web Analytics
inject();
