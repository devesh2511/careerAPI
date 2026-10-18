-- Admins edit roadmaps in the admin panel (Admin · Roadmaps).
--   version    — goes up on every save; a save must name the version it
--                edited, so two admins editing at once can't silently
--                overwrite each other (409 roadmap_changed).
--   updated_by — the admin who saved it last (NULL for seeded rows).
-- (career_roadmaps.sort_order is no longer read; order comes from careers.)

ALTER TABLE career_roadmaps
  ADD COLUMN IF NOT EXISTS version    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by uuid    REFERENCES admins (id) ON DELETE SET NULL;
