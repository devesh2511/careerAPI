-- Emailed password-reset codes for students, as admin_password_resets does
-- for admins. At most one live code per student: asking again replaces it.
-- Only a hash of the code is stored.

CREATE TABLE IF NOT EXISTS student_password_resets (
  student_id uuid        PRIMARY KEY REFERENCES students (id) ON DELETE CASCADE,
  code_hash  bytea       NOT NULL,
  attempts   integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
