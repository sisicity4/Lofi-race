import './styles.css';
import { App } from './app/App';

const appRoot = document.getElementById('app');

if (!appRoot) {
  throw new Error('Missing #app root element');
}

const app = new App(appRoot);
void app.mount();
