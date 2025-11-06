-- sql/init.sql
CREATE TABLE IF NOT EXISTS hands (
  id UUID PRIMARY KEY,
  payload JSONB NOT NULL,
  payoffs JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);