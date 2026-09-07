import { render as renderHello } from './screens/hello.js';
import { render as renderSettings } from './screens/settings.js';
import { getBridgeConfig } from './config.js';

const screens = { hello: renderHello, settings: renderSettings };
const root = document.getElementById('app');
let current = null;

function navigate(name) {
  if (current) {
    try { current.detach(); } catch (_) {}
    current = null;
  }
  const fn = screens[name];
  if (!fn) return;
  current = fn(root, { navigate: navigate });
}

navigate(getBridgeConfig() ? 'hello' : 'settings');
