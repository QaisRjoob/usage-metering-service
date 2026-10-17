-- Integrity hardening. The few deliberately repeated columns (kept for locking, idempotency and
-- index-only reads) are now tied to their source by the database itself, so they can never drift.
-- See docs/DATABASE.md for the normal-form analysis.

-- 1. A plan's current version must be one of ITS versions (not just any plan_versions row).
ALTER TABLE plan_versions ADD CONSTRAINT plan_versions_id_plan_unique UNIQUE (id, plan_id);
ALTER TABLE plans DROP CONSTRAINT plans_current_version_fk;
ALTER TABLE plans
  ADD CONSTRAINT plans_current_version_fk FOREIGN KEY (current_version_id, id)
  REFERENCES plan_versions (id, plan_id) DEFERRABLE INITIALLY DEFERRED;

-- 2. usage_records.account_id repeats users.account_id (it scopes idempotency and history). The
--    composite key guarantees the pair matches the user's real account.
ALTER TABLE users ADD CONSTRAINT users_id_account_unique UNIQUE (id, account_id);
ALTER TABLE usage_records DROP CONSTRAINT usage_records_user_id_fkey;
ALTER TABLE usage_records
  ADD CONSTRAINT usage_records_user_account_fk FOREIGN KEY (user_id, account_id) REFERENCES users (id, account_id);

-- 3. usage_records.period is the UTC month of created_at (kept as a column for the indexes).
ALTER TABLE usage_records
  ADD CONSTRAINT usage_records_period_matches_created
  CHECK (period = date_trunc('month', created_at AT TIME ZONE 'UTC')::date);

-- 4. Sign-up requests: the requested plan must be an account plan (same scope trick as accounts),
--    one request creates at most one account, and emails compare case-insensitively.
ALTER TABLE signup_requests
  ADD COLUMN requested_plan_scope text NOT NULL DEFAULT 'account' CHECK (requested_plan_scope = 'account');
ALTER TABLE signup_requests DROP CONSTRAINT signup_requests_requested_plan_id_fkey;
ALTER TABLE signup_requests
  ADD CONSTRAINT signup_requests_plan_fk FOREIGN KEY (requested_plan_id, requested_plan_scope) REFERENCES plans (id, scope);
ALTER TABLE signup_requests ADD CONSTRAINT signup_requests_account_unique UNIQUE (account_id);
ALTER TABLE signup_requests ADD CONSTRAINT signup_requests_email_lowercase CHECK (contact_email = lower(contact_email));
DROP INDEX signup_requests_one_pending_per_email;
CREATE UNIQUE INDEX signup_requests_one_pending_per_email ON signup_requests (lower(contact_email)) WHERE status = 'pending';

-- 5. Display prefixes are the first 13 characters of a key ("umk_live_xxxx").
ALTER TABLE accounts ADD CONSTRAINT accounts_api_key_prefix_shape CHECK (api_key_prefix ~ '^umk_(live|demo)_[A-Za-z0-9_-]{4}$');
ALTER TABLE accounts ADD CONSTRAINT accounts_api_key_hash_shape CHECK (api_key_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE signup_requests ADD CONSTRAINT signup_requests_claim_hash_shape CHECK (claim_code_hash ~ '^[0-9a-f]{64}$');
