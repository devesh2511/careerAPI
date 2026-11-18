-- One school per student (admin customer support design, Part 1). From now on
-- the API keeps a student on at most one school's list; this removes the
-- extra school rows that already exist.
--
-- IRREVERSIBLE: it deletes list rows of paying schools. Kept in its own file
-- so it can be held back: check what it would delete first with the SELECT
-- in the comment at the end.
--
-- Per person (phone + name ignoring case), across every school (deleted ones
-- too, so restoring one can't bring a second school back), the row kept is
-- the most recently uploaded: its subscription's creation (renewals move a
-- row to the new subscription), else when the row was first added. Ties go
-- to the higher institute id. If the kept row has no account but a removed
-- one does (registered at School A, School B's upload not linked yet), the
-- kept row is linked to that account, so nobody loses access. Removed rows
-- that were linked get a moved_school event; then every account re-picks the
-- institute it shows (as refreshInstitutes does). Running it again changes
-- nothing.

WITH school_rows AS (
  SELECT u.institute_id, u.name, u.phone_no, u.metadata_id, u.registered_at, i.name AS institute_name, i.institute_code,
         row_number() OVER (
           PARTITION BY u.phone_no, lower(u.name)
           ORDER BY greatest(u.created_at, coalesce(s.created_at, u.created_at)) DESC, u.institute_id DESC) AS rn
    FROM "user" u
    JOIN institute i ON i.id = u.institute_id AND i.type = 'school'
    LEFT JOIN subscription s ON s.id = u.subscription_id
), losers AS (
  SELECT l.*, k.institute_id AS kept_id, k.institute_name AS kept_name, k.institute_code AS kept_code,
         k.metadata_id AS kept_metadata_id
    FROM school_rows l
    JOIN school_rows k ON k.phone_no = l.phone_no AND lower(k.name) = lower(l.name) AND k.rn = 1
   WHERE l.rn > 1
), carried AS (
  -- The account a removed row was linked to moves onto the kept, unlinked row
  -- (at most one account per person: user_metadata_person_key).
  UPDATE "user" k
     SET metadata_id = c.metadata_id, status = 'registered', registered_at = coalesce(c.registered_at, now())
    FROM (SELECT DISTINCT ON (kept_id, phone_no, lower(name)) kept_id, phone_no, name, metadata_id, registered_at
            FROM losers WHERE metadata_id IS NOT NULL AND kept_metadata_id IS NULL
           ORDER BY kept_id, phone_no, lower(name), registered_at) c
   WHERE k.institute_id = c.kept_id AND k.phone_no = c.phone_no AND lower(k.name) = lower(c.name)
     AND k.metadata_id IS NULL
), logged AS (
  INSERT INTO student_events (student_id, kind, note, data)
  SELECT metadata_id, 'moved_school', 'one-school cleanup',
         jsonb_build_object(
           'via', 'cleanup',
           'from', jsonb_build_object('id', institute_id, 'name', institute_name, 'institute_code', institute_code),
           'to', jsonb_build_object('id', kept_id, 'name', kept_name, 'institute_code', kept_code))
    FROM losers WHERE metadata_id IS NOT NULL
)
DELETE FROM "user" u
 USING losers l
 WHERE u.institute_id = l.institute_id AND u.phone_no = l.phone_no AND lower(u.name) = lower(l.name);

UPDATE user_metadata m
   SET institute_id = p.id, institute_code = p.institute_code
  FROM (SELECT ids.id AS student_id, pick.id, pick.institute_code
          FROM user_metadata ids
          LEFT JOIN LATERAL (
            SELECT i.id, i.institute_code
              FROM "user" u JOIN institute i ON i.id = u.institute_id AND NOT i.is_deleted
             WHERE u.metadata_id = ids.id
             ORDER BY i.type = 'school' DESC, u.registered_at, i.id
             LIMIT 1) pick ON true) p
 WHERE m.id = p.student_id
   AND (m.institute_id IS DISTINCT FROM p.id OR m.institute_code IS DISTINCT FROM p.institute_code);

-- What it would delete (read-only):
--   SELECT phone_no, lower(name), array_agg(i.institute_code ORDER BY u.created_at) AS schools
--     FROM "user" u JOIN institute i ON i.id = u.institute_id AND i.type = 'school'
--    GROUP BY phone_no, lower(name) HAVING count(*) > 1;
