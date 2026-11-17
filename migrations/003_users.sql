-- Student accounts (user_metadata), the institute lists they come from
-- ("user"), their sessions and their emailed reset links
-- (account_subscription_er_diagram.png).
--
-- A "user" row is one student's place on one institute's list, uploaded by
-- the admin. A student on two lists (school and tuition) has two rows, both
-- pointing at the same user_metadata row: one account, one login.
--
-- "user" is a reserved word in Postgres: always write it quoted.

CREATE TABLE IF NOT EXISTS user_metadata (
  id                integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Chosen at registration; what they log in with. Stored lower-case.
  username          text        NOT NULL CHECK (username ~ '^[a-z0-9._]{3,30}$'),
  -- Name and phone as on the institute list. Together they are the person:
  -- siblings share a phone, two students can share a name.
  name              text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  phone_no          text        NOT NULL CHECK (phone_no ~ '^[6-9][0-9]{9}$'),
  -- The institute shown on the account: their school when they're on a
  -- school's list, else the first institute they registered through. Copies
  -- of institute.id / institute_code, kept in step by the API.
  institute_id      integer     REFERENCES institute (id) ON DELETE SET NULL,
  institute_code    text,
  email             text        CHECK (email IS NULL OR length(email) <= 254),
  -- Set when they click an emailed link sent to `email`.
  email_verified_at timestamptz,
  -- scrypt hash (password.service.js), never the password.
  password          text        NOT NULL,
  city              text        NOT NULL CHECK (length(city) BETWEEN 1 AND 80),
  class             smallint    NOT NULL CHECK (class IN (9, 10)),
  board             text        NOT NULL CHECK (board IN ('CBSE', 'ICSE', 'State Board')),
  -- Not in the diagram: the rest of the app needs these.
  current_career    text,
  career_updated_at timestamptz,
  last_login_at     timestamptz,
  is_deleted        boolean     NOT NULL DEFAULT false,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (is_deleted = (deleted_at IS NOT NULL)),
  CHECK (email_verified_at IS NULL OR email IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS user_metadata_username_key ON user_metadata (username);
-- One account per person.
CREATE UNIQUE INDEX IF NOT EXISTS user_metadata_person_key ON user_metadata (phone_no, lower(name));
CREATE INDEX IF NOT EXISTS user_metadata_current_career_idx ON user_metadata (current_career) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS user_metadata_institute_id_idx ON user_metadata (institute_id);
CREATE OR REPLACE TRIGGER user_metadata_updated_at BEFORE UPDATE ON user_metadata
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "user" (
  institute_id    integer     NOT NULL REFERENCES institute (id) ON DELETE CASCADE,
  -- Trimmed, single-spaced. Matching ignores case.
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  phone_no        text        NOT NULL CHECK (phone_no ~ '^[6-9][0-9]{9}$'),
  -- unregistered: on the list, no account yet. registered: linked to one.
  status          text        NOT NULL DEFAULT 'unregistered' CHECK (status IN ('unregistered', 'registered')),
  -- The subscription the upload put them on; re-uploading for a renewal
  -- moves them to the new one.
  subscription_id integer     REFERENCES subscription (id) ON DELETE SET NULL,
  metadata_id     integer     REFERENCES user_metadata (id),
  -- When metadata_id was set: the first institute a student registered
  -- through is the one their account shows, unless a school comes later.
  registered_at   timestamptz,
  added_by        uuid        REFERENCES admins (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institute_id, name, phone_no),
  CHECK ((status = 'registered') = (metadata_id IS NOT NULL)),
  CHECK ((metadata_id IS NULL) = (registered_at IS NULL))
);
-- The key above, ignoring case: "Harsh Shah" and "harsh shah" are one row.
CREATE UNIQUE INDEX IF NOT EXISTS user_person_key ON "user" (institute_id, phone_no, lower(name));
CREATE INDEX IF NOT EXISTS user_metadata_id_idx ON "user" (metadata_id);
CREATE INDEX IF NOT EXISTS user_subscription_id_idx ON "user" (subscription_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   bytea       PRIMARY KEY,
  student_id   integer     NOT NULL REFERENCES user_metadata (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent   text
);
CREATE INDEX IF NOT EXISTS sessions_student_id_idx ON sessions (student_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- Emailed password-reset links. Clicking one also verifies the address it was
-- sent to. At most one live link per student: asking again replaces it. Only
-- a hash of the link's token is stored.
CREATE TABLE IF NOT EXISTS student_reset_links (
  student_id integer     PRIMARY KEY REFERENCES user_metadata (id) ON DELETE CASCADE,
  token_hash bytea       NOT NULL UNIQUE,
  -- Where the link went. Becomes user_metadata.email (verified) when used.
  email      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
