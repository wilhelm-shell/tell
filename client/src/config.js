// Runtime config, read from localStorage — nothing sensitive lives in the bundle.
//
// Dev flow (desktop Firefox or WebIDE console):
//   localStorage.setItem('bridge.url', 'http://127.0.0.1:8787');
//   localStorage.setItem('bridge.token', 'your-dev-token');
//   location.reload();

export const DEFAULTS = {
  requestTimeoutMs: 10000,
  messageCacheCap: 200,
};

export function getBridgeConfig() {
  const url = localStorage.getItem('bridge.url');
  const token = localStorage.getItem('bridge.token');
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}
