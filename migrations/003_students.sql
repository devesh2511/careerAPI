-- Student accounts, how they log in, and their sessions (schema §2).

CREATE TABLE students (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text        NOT NULL,
  full_name         text        NOT NULL CHECK (length(full_name) BETWEEN 1 AND 80),
  school_id         integer     REFERENCES schools (id) ON DELETE SET NULL,
  current_career    text,
  career_updated_at timestamptz,
  is_deleted        boolean     NOT NULL DEFAULT false,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (is_deleted = (deleted_at IS NOT NULL))
);
-- Soft-deleted rows keep their email: a returning student is restored, not re-registered.
CREATE UNIQUE INDEX students_email_key ON students (lower(email));
CREATE INDEX students_current_career_idx ON students (current_career) WHERE NOT is_deleted;
CREATE INDEX students_school_id_idx ON students (school_id);
CREATE TRIGGER students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE auth_identities (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id       uuid        NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  provider         text        NOT NULL CHECK (provider IN ('password')),
  provider_subject text        NOT NULL,
  password_hash    text,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject),
  UNIQUE (student_id, provider),
  CHECK ((provider = 'password') = (password_hash IS NOT NULL))
);

CREATE TABLE sessions (
  token_hash   bytea       PRIMARY KEY,
  student_id   uuid        NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent   text
);
CREATE INDEX sessions_student_id_idx ON sessions (student_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
