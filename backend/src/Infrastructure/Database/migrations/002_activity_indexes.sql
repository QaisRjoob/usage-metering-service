-- Per-user request counts of one month (operator users directory and its activity filters).
CREATE INDEX IF NOT EXISTS usage_records_user_period_idx ON usage_records (user_id, period);
