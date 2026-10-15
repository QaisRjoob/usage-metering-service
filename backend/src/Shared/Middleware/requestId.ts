import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Keeps a caller-supplied X-Request-Id (correlation id) when it is safe, otherwise generates one. */
export function generateRequestId(request: IncomingMessage): string {
  const incoming = request.headers['x-request-id'];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && SAFE_ID.test(value) ? value : randomUUID();
}
