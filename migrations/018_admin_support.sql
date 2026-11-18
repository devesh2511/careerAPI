-- Admin customer support (docs/superpowers/specs/2026-11-18-admin-customer-support-design.md):
-- deactivating accounts, the history of what admins did to an account, old
-- names / phones that list uploads still recognise, and email confirmation
-- links.

-- ── Deactivation ──────────────────────────────────────────────────────────
-- A disciplinary lock (malpractice), separate from soft delete: the account
-- can't log in and is hidden from leaderboards, but its data stays as
-- evidence. Only an admin can lift it. "Left the institute" is not this: that
-- just takes them off that institute's list.
ALTER TABLE user_metadata ADD COLUMN IF NOT EXISTS deactivated_at      timestamptz;
ALTER TABLE user_metadata ADD COLUMN IF NOT EXISTS deactivation_reason text;
ALTER TABLE user_metadata ADD COLUMN IF NOT EXISTS deactivated_by      uuid REFERENCES admins (id) ON DELETE SET NULL;
ALTER TABLE user_metadata ADD COLUMN IF NOT EXISTS deactivation_note   text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_metadata_deactivation_check') THEN
    -- deactivated_by may go NULL later (admin hard-deleted), so it isn't in
    -- the all-or-nothing check.
    ALTER TABLE user_metadata ADD CONSTRAINT user_metadata_deactivation_check CHECK (
      (deactivated_at IS NULL) = (deactivation_reason IS NULL) AND
      (deactivated_at IS NULL) = (deactivation_note IS NULL) AND
      (deactivation_reason IS NULL OR deactivation_reason IN ('malpractice')) AND
      (deactivation_note IS NULL OR length(deactivation_note) BETWEEN 1 AND 500));
  END IF;
END $$;

-- ── History ───────────────────────────────────────────────────────────────
-- What happened to an account and why: admin actions, and moves between
-- schools (by an upload, a link or the one-school cleanup). Newest first on
-- the admin's student page. Goes with the account when it's hard-deleted.
CREATE TABLE IF NOT EXISTS student_events (
  id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id integer     NOT NULL REFERENCES user_metadata (id) ON DELETE CASCADE,
  -- NULL for automatic events, or once that admin is hard-deleted.
  admin_id   uuid        REFERENCES admins (id) ON DELETE SET NULL,
  kind       text        NOT NULL CHECK (kind IN (
               'deactivated', 'reactivated', 'left_institute', 'details_changed', 'password_set', 'moved_school')),
  note       text        CHECK (note IS NULL OR length(note) <= 500),
  -- Old and new values, institutes involved.
  data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_events_student_idx ON student_events (student_id, created_at DESC);

-- ── Old details ───────────────────────────────────────────────────────────
-- A name + phone an account had before an admin corrected it. A list upload
-- that still carries it is matched to the account (current details first).
CREATE TABLE IF NOT EXISTS student_aliases (
  id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id integer     NOT NULL REFERENCES user_metadata (id) ON DELETE CASCADE,
  name       text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  phone_no   text        NOT NULL CHECK (phone_no ~ '^[6-9][0-9]{9}$'),
  created_by uuid        REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS student_aliases_key ON student_aliases (student_id, phone_no, lower(name));
CREATE INDEX IF NOT EXISTS student_aliases_person_idx ON student_aliases (phone_no, lower(name));

-- ── Email confirmation links ──────────────────────────────────────────────
-- Sent only when the student clicks "Confirm email". Like
-- student_reset_links, but separate so asking for one doesn't cancel the
-- other. At most one live link per student; only a hash of the token.
CREATE TABLE IF NOT EXISTS student_email_confirmations (
  student_id integer     PRIMARY KEY REFERENCES user_metadata (id) ON DELETE CASCADE,
  token_hash bytea       NOT NULL UNIQUE,
  -- Where it went: it only confirms the account's email if that's unchanged.
  email      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
