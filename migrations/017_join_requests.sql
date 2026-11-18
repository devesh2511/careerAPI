-- Requests to join an institute from students who aren't on its list.
--
-- Most institutes only let listed students register (002/003). One with
-- accepts_requests also takes students who aren't on its list: they register
-- as usual (or link an existing account), which creates their account and a
-- join_requests row, and they have no access until an admin approves it.
-- Approving adds them to the list, registered and on the institute's current
-- subscription, and deletes the request; rejecting just deletes the request
-- (the account stays, like a student removed from a list).
--
-- Kept apart from "user" on purpose: every "user" row is a real list entry,
-- and the access check, counts and list uploads rely on that.

ALTER TABLE institute ADD COLUMN IF NOT EXISTS accepts_requests boolean NOT NULL DEFAULT false;

-- The testing institute takes requests.
UPDATE institute SET accepts_requests = true WHERE institute_code = 'CRK-TEST' AND NOT accepts_requests;

CREATE TABLE IF NOT EXISTS join_requests (
  id           integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institute_id integer     NOT NULL REFERENCES institute (id) ON DELETE CASCADE,
  -- The account asking. Its name and phone are what go on the list.
  metadata_id  integer     NOT NULL REFERENCES user_metadata (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- One request per account per institute.
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_account_key ON join_requests (institute_id, metadata_id);
CREATE INDEX IF NOT EXISTS join_requests_metadata_id_idx ON join_requests (metadata_id);
