-- Refresh tokens for the JWT sessions. Opaque random values; only the SHA-256 hash is stored.
-- Each token is used once: refreshing marks it used and issues the next one in the same family
-- (one family = one login session). A used token presented again revokes the whole family.
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  role        text NOT NULL CHECK (role IN ('operator', 'account')),
  account_id  uuid REFERENCES accounts (id),
  created_at  timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  revoked_at  timestamptz,
  -- Account sessions name their account; operator sessions have none.
  CONSTRAINT refresh_tokens_role_account CHECK ((role = 'operator') = (account_id IS NULL)),
  CONSTRAINT refresh_tokens_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_expires_idx ON refresh_tokens (expires_at);
CREATE INDEX refresh_tokens_account_idx ON refresh_tokens (account_id) WHERE account_id IS NOT NULL;
