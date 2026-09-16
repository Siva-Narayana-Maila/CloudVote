-- CloudVote database schema
-- Applied once at startup by auth-service (owns user identity data).
-- voting-service and tally-service share this same database via DATABASE_URL,
-- but only auth-service writes to `users`, only voting-service writes to
-- `vote_ledger`, and tally-service only reads. Enforcing that separation is
-- an application-level convention here (documented in docs/design-decisions.md),
-- not a DB permission — fine for a course project; a production system would
-- use separate DB roles per service.

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    mfa_secret      TEXT,               -- speakeasy TOTP secret, set once MFA is enabled
    mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    has_voted       BOOLEAN NOT NULL DEFAULT FALSE,  -- duplicate-vote guard, checked by voting-service
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only, hash-chained vote ledger.
-- Each row's current_hash commits to the previous row's hash, the candidate
-- choice, and the timestamp — so altering any past row breaks every hash
-- after it. This is the "tamper-proof" property shown as the commitment
-- hash on the receipt screen in the UI design (see docs/design-decisions.md
-- for why this replaces DynamoDB/QLDB from the original slide).
CREATE TABLE IF NOT EXISTS vote_ledger (
    ledger_position BIGSERIAL PRIMARY KEY,
    receipt_id      TEXT UNIQUE NOT NULL,
    candidate_id    TEXT NOT NULL,       -- candidate choice; NOT linked to voter identity in this table
    previous_hash   TEXT NOT NULL,
    current_hash    TEXT NOT NULL,
    cast_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Revoke UPDATE/DELETE at the app-role level so tampering requires breaking
-- the hash chain rather than just rewriting a row. Run manually once you've
-- created a dedicated `cloudvote_app` role in production; skipped in local
-- dev where the default role owns the table.
-- REVOKE UPDATE, DELETE ON vote_ledger FROM cloudvote_app;

CREATE INDEX IF NOT EXISTS idx_vote_ledger_candidate ON vote_ledger(candidate_id);

-- Elections & candidates: makes the ballot configurable instead of
-- hardcoded, and lets voting-service enforce a real closing time.
CREATE TABLE IF NOT EXISTS elections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    opens_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    closes_at   TIMESTAMPTZ NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidates (
    id            TEXT PRIMARY KEY,       -- slug, e.g. 'mara-ellison'
    election_id   UUID NOT NULL REFERENCES elections(id),
    name          TEXT NOT NULL,
    role          TEXT,
    bio           TEXT,
    color         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidates_election ON candidates(election_id);
