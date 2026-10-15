-- Usage Metering & Quota Service - initial schema.
-- Units are BIGINT counters (never floating point). Periods are UTC months stored as DATE
-- (first day of the month). All timestamps are TIMESTAMPTZ.

CREATE TABLE plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  description         text CHECK (description IS NULL OR char_length(description) <= 500),
  scope               text NOT NULL CHECK (scope IN ('account', 'user')),
  is_predefined       boolean NOT NULL DEFAULT false,
  owner_account_id    uuid,
  current_version_id  uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Predefined plans have no owner; custom plans have exactly one.
  CONSTRAINT plans_owner_matches_kind CHECK (is_predefined = (owner_account_id IS NULL)),
  -- Lets accounts/users reference (plan id, scope) so the database enforces plan scope.
  CONSTRAINT plans_id_scope_unique UNIQUE (id, scope)
);
CREATE UNIQUE INDEX plans_custom_name_unique ON plans (owner_account_id, lower(name)) WHERE owner_account_id IS NOT NULL;
CREATE UNIQUE INDEX plans_predefined_name_unique ON plans (lower(name)) WHERE is_predefined;

-- Immutable revisions of a plan's limits. Rows are only ever inserted.
CREATE TABLE plan_versions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                uuid NOT NULL REFERENCES plans (id),
  version                integer NOT NULL CHECK (version >= 1),
  monthly_allowance      bigint NOT NULL CHECK (monthly_allowance >= 0),
  max_units_per_request  bigint NOT NULL CHECK (max_units_per_request > 0),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_versions_plan_version_unique UNIQUE (plan_id, version)
);

-- A plan and its first version are inserted in the same transaction, so this is deferred.
ALTER TABLE plans
  ADD CONSTRAINT plans_current_version_fk FOREIGN KEY (current_version_id) REFERENCES plan_versions (id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  api_key_hash    text NOT NULL UNIQUE,  -- SHA-256 hex of the key; the raw key is never stored
  api_key_prefix  text NOT NULL,         -- non-secret, for display
  plan_id         uuid NOT NULL,
  plan_scope      text NOT NULL DEFAULT 'account' CHECK (plan_scope = 'account'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_plan_fk FOREIGN KEY (plan_id, plan_scope) REFERENCES plans (id, scope)
);
CREATE INDEX accounts_plan_idx ON accounts (plan_id);
CREATE INDEX accounts_created_idx ON accounts (created_at DESC, id DESC);

ALTER TABLE plans ADD CONSTRAINT plans_owner_fk FOREIGN KEY (owner_account_id) REFERENCES accounts (id);

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts (id),
  external_user_id  text NOT NULL CHECK (char_length(external_user_id) BETWEEN 1 AND 128),
  display_name      text CHECK (display_name IS NULL OR char_length(display_name) <= 100),
  plan_id           uuid NOT NULL,
  plan_scope        text NOT NULL DEFAULT 'user' CHECK (plan_scope = 'user'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_account_external_unique UNIQUE (account_id, external_user_id),
  CONSTRAINT users_plan_fk FOREIGN KEY (plan_id, plan_scope) REFERENCES plans (id, scope)
);
CREATE INDEX users_plan_idx ON users (plan_id);

-- Monthly counters. A new month means new rows; old rows stay for history (no reset job).
CREATE TABLE account_usage_counters (
  account_id  uuid NOT NULL REFERENCES accounts (id),
  period      date NOT NULL CHECK (extract(day FROM period) = 1),
  consumed    bigint NOT NULL DEFAULT 0 CHECK (consumed >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, period)
);
CREATE INDEX account_usage_counters_period_idx ON account_usage_counters (period);

CREATE TABLE user_usage_counters (
  user_id     uuid NOT NULL REFERENCES users (id),
  period      date NOT NULL CHECK (extract(day FROM period) = 1),
  consumed    bigint NOT NULL DEFAULT 0 CHECK (consumed >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period)
);

-- Every consume request and its decision (accepted and rejected). Also the idempotency record.
CREATE TABLE usage_records (
  id                       uuid PRIMARY KEY,
  account_id               uuid NOT NULL REFERENCES accounts (id),
  user_id                  uuid NOT NULL REFERENCES users (id),
  request_id               text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 128),
  units_requested          bigint NOT NULL CHECK (units_requested > 0),
  outcome                  text NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  rejection_rule           text CHECK (rejection_rule IN ('MAX_UNITS_PER_REQUEST', 'MONTHLY_ALLOWANCE')),
  rejection_level          text CHECK (rejection_level IN ('account', 'user')),
  violations               jsonb NOT NULL DEFAULT '[]'::jsonb,
  account_plan_version_id  uuid NOT NULL REFERENCES plan_versions (id),
  user_plan_version_id     uuid NOT NULL REFERENCES plan_versions (id),
  account_consumed_after   bigint NOT NULL CHECK (account_consumed_after >= 0),
  user_consumed_after      bigint NOT NULL CHECK (user_consumed_after >= 0),
  period                   date NOT NULL CHECK (extract(day FROM period) = 1),
  created_at               timestamptz NOT NULL,
  correlation_id           text,
  replay_count             integer NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  last_replayed_at         timestamptz,
  -- Idempotency scope: one decision per (account, requestId).
  CONSTRAINT usage_records_idempotency_unique UNIQUE (account_id, request_id),
  CONSTRAINT usage_records_rejection_consistent CHECK (
    (outcome = 'accepted' AND rejection_rule IS NULL AND rejection_level IS NULL)
    OR (outcome = 'rejected' AND rejection_rule IS NOT NULL AND rejection_level IS NOT NULL)
  )
);
-- History pages: newest first with id as tie-breaker, per account / per user / per account+month / global.
CREATE INDEX usage_records_account_created_idx ON usage_records (account_id, created_at DESC, id DESC);
CREATE INDEX usage_records_account_period_idx ON usage_records (account_id, period, created_at DESC, id DESC);
CREATE INDEX usage_records_user_created_idx ON usage_records (user_id, created_at DESC, id DESC);
CREATE INDEX usage_records_created_idx ON usage_records (created_at DESC, id DESC);
CREATE INDEX usage_records_period_idx ON usage_records (period);
