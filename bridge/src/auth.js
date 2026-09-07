import { timingSafeEqual } from 'node:crypto';

const PREFIX = 'Bearer ';

export function checkBearer(headerValue, expected) {
  if (typeof headerValue !== 'string') return false;
  if (!headerValue.startsWith(PREFIX)) return false;
  const provided = headerValue.slice(PREFIX.length);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
