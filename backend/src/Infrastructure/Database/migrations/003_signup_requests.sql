-- Self-service sign-up requests. The applicant follows a request with its id and a claim code
-- (only the SHA-256 hash is stored); the operator approves (an account is created) or rejects it.
CREATE TABLE signup_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name       text NOT NULL CHECK (char_length(company_name) BETWEEN 2 AND 100),
  contact_name       text NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 100),
  contact_email      text NOT NULL CHECK (char_length(contact_email) BETWEEN 3 AND 254),
  use_case           text CHECK (use_case IS NULL OR char_length(use_case) <= 1000),
  requested_plan_id  uuid NOT NULL REFERENCES plans (id),
  claim_code_hash    text NOT NULL,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_note      text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  account_id         uuid REFERENCES accounts (id),
  submitted_at       timestamptz NOT NULL,
  decided_at         timestamptz,
  claimed_at         timestamptz,
  CONSTRAINT signup_requests_decision_consistent CHECK (
    (status = 'pending' AND decided_at IS NULL AND account_id IS NULL)
    OR (status = 'approved' AND decided_at IS NOT NULL AND account_id IS NOT NULL)
    OR (status = 'rejected' AND decided_at IS NOT NULL AND account_id IS NULL)
  ),
  CONSTRAINT signup_requests_claim_after_approval CHECK (claimed_at IS NULL OR status = 'approved')
);
-- One open request per email; decided requests do not block a new one.
CREATE UNIQUE INDEX signup_requests_one_pending_per_email ON signup_requests (contact_email) WHERE status = 'pending';
CREATE INDEX signup_requests_submitted_idx ON signup_requests (submitted_at DESC, id DESC);
CREATE INDEX signup_requests_status_submitted_idx ON signup_requests (status, submitted_at DESC, id DESC);
