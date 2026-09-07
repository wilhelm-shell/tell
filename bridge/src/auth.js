import { timingSafeEqual } from 'node:crypto';

export function safeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const PREFIX = 'Bearer ';

export function checkBearer(headerValue, expected) {
  if (typeof headerValue !== 'string') return false;
  if (!headerValue.startsWith(PREFIX)) return false;
  return safeEqualString(headerValue.slice(PREFIX.length), expected);
}
