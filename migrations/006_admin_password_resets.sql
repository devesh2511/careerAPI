-- Emailed password-reset codes for admins (schema §3.3). At most one live
-- code per admin: asking again replaces it. Only a hash of the code is stored.

CREATE TABLE admin_password_resets (
  admin_id   uuid        PRIMARY KEY REFERENCES admins (id) ON DELETE CASCADE,
  code_hash  bytea       NOT NULL,
  attempts   integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
