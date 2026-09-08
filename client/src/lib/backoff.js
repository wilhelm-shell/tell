// Reconnect delays: quick first retries, then settle at 30s so a dead
// network is not hammered. Pure, so it is tested off-device.
const DELAYS_MS = [2000, 5000, 10000, 30000];

export function reconnectDelay(attempt) {
  const i = Math.max(0, Math.min(attempt | 0, DELAYS_MS.length - 1));
  return DELAYS_MS[i];
}
