import { env } from 'node:process';

function required(name) {
  const v = env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

const originsRaw = env.BRIDGE_ALLOWED_ORIGINS ?? '';
const allowedOrigins = originsRaw.split(',').map(s => s.trim()).filter(Boolean);

export const config = {
  port: Number(env.BRIDGE_PORT ?? 8787),
  host: env.BRIDGE_HOST ?? '127.0.0.1',
  token: required('BRIDGE_TOKEN'),
  allowedOrigins,
};
