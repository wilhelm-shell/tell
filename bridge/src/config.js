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
  // How many recent signal.message frames to replay after WS auth; 0 disables.
  backlogCap: Number(env.BRIDGE_BACKLOG_CAP ?? 200),
  // Keep the backlog on disk (inside BRIDGE_DATA_DIR) so a restart does not
  // empty the phone. Off by default for a bare bridge; Compose turns it on.
  persist: env.BRIDGE_PERSIST === 'true',
  dataDir: env.BRIDGE_DATA_DIR || 'data',
  signal: {
    enabled: env.SIGNAL_CLI_ENABLED === 'true',
    bin: env.SIGNAL_CLI_BIN || 'signal-cli',
    rpcHost: env.SIGNAL_CLI_RPC_HOST || '127.0.0.1',
    rpcPort: Number(env.SIGNAL_CLI_RPC_PORT || 7583),
    dataDir: env.SIGNAL_CLI_DATA_DIR || null,
  },
};
