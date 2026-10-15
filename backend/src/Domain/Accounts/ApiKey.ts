import { createHash, randomBytes } from 'node:crypto';

/**
 * Account API keys: "umk_live_" + 32 random bytes (base64url, 256 bits of entropy).
 * Only the SHA-256 hash is stored. A slow password hash is unnecessary because the key is long
 * and random; SHA-256 also allows an indexed lookup by hash. The first 13 characters are kept
 * as a non-secret prefix for display.
 */
export const API_KEY_PREFIX_LENGTH = 13;
const API_KEY_PATTERN = /^umk_(live|demo)_[A-Za-z0-9_-]{20,128}$/;

export interface IssuedApiKey {
  /** Shown to the caller once, never stored. */
  raw: string;
  hash: string;
  prefix: string;
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function apiKeyPrefixOf(raw: string): string {
  return raw.slice(0, API_KEY_PREFIX_LENGTH);
}

export function generateApiKey(random: (size: number) => Buffer = randomBytes): IssuedApiKey {
  const raw = `umk_live_${random(32).toString('base64url')}`;
  return { raw, hash: hashApiKey(raw), prefix: apiKeyPrefixOf(raw) };
}

/** Cheap shape check before touching the database. */
export function looksLikeApiKey(value: string): boolean {
  return API_KEY_PATTERN.test(value);
}
