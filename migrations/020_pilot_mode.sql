-- Pilot mode (docs/superpowers/specs/2026-11-21-pilot-mode-design.md).
--
-- Before an institute pays, an admin can run a short free pilot: while it is
-- live, students who aren't on the institute's list register with just the
-- institute ID and get access straight away, up to a seat limit per class.
-- The pilot is live while pilot_mode is on, now() < pilot_ends_at, and the
-- institute is active and not deleted; nothing has to switch it off.
--
-- A pilot registration puts the student on the list like everyone else: a
-- registered "user" row, tagged via_pilot, with no subscription. When the
-- institute pays and the admin uploads its list, that row moves onto the new
-- subscription (the renewal path), so the account carries over. A pilot row
-- that has been on a subscription (subscription_id set) never gets pilot
-- access again and doesn't take a seat. One pilot per institute: turning it
-- back on continues the same pilot.

ALTER TABLE institute ADD COLUMN IF NOT EXISTS pilot_mode          boolean     NOT NULL DEFAULT false;
ALTER TABLE institute ADD COLUMN IF NOT EXISTS pilot_ends_at       timestamptz;
ALTER TABLE institute ADD COLUMN IF NOT EXISTS pilot_seats_class9  smallint    NOT NULL DEFAULT 5;
ALTER TABLE institute ADD COLUMN IF NOT EXISTS pilot_seats_class10 smallint    NOT NULL DEFAULT 5;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institute_pilot_ends_check') THEN
    ALTER TABLE institute ADD CONSTRAINT institute_pilot_ends_check
      CHECK (NOT pilot_mode OR pilot_ends_at IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institute_pilot_seats_check') THEN
    ALTER TABLE institute ADD CONSTRAINT institute_pilot_seats_check
      CHECK (pilot_seats_class9 >= 0 AND pilot_seats_class10 >= 0);
  END IF;
END $$;

-- Set by a pilot registration; kept after the paid upload as a record of who
-- came through the pilot.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS via_pilot boolean NOT NULL DEFAULT false;
-- The class whose pilot seat the sign-up took. Seats are counted by this,
-- not the account's class, so changing class later can't free a seat.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS pilot_class smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_pilot_class_check') THEN
    ALTER TABLE "user" ADD CONSTRAINT user_pilot_class_check
      CHECK (pilot_class IS NULL OR pilot_class IN (9, 10));
  END IF;
END $$;
