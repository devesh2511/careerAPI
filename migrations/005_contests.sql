-- Weekly contests and their 5 hand-authored questions (schema §5.1, §5.2).
-- attempts and attempt_answers come with the student contest endpoints.

CREATE TABLE contests (
  id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opens_at   timestamptz NOT NULL,
  closes_at  timestamptz NOT NULL,
  status     text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled')),
  scored_at  timestamptz,
  created_by uuid        REFERENCES admins (id) ON DELETE SET NULL,
  is_deleted boolean     NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Sat 07:00 IST → Sun 19:00 IST.
  CHECK (closes_at = opens_at + interval '36 hours'),
  CHECK (extract(isodow FROM opens_at AT TIME ZONE 'Asia/Kolkata') = 6
         AND (opens_at AT TIME ZONE 'Asia/Kolkata')::time = '07:00'),
  CHECK (is_deleted = (deleted_at IS NOT NULL)),
  -- No two live contests overlap; a soft-deleted one frees its week.
  CONSTRAINT contests_no_overlap
    EXCLUDE USING gist (tstzrange(opens_at, closes_at) WITH &&) WHERE (NOT is_deleted)
);
CREATE TRIGGER contests_updated_at BEFORE UPDATE ON contests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE contest_questions (
  id            text        PRIMARY KEY,
  contest_id    integer     NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  position      smallint    NOT NULL CHECK (position BETWEEN 1 AND 5),
  area          text        NOT NULL CHECK (area IN ('Logical Reasoning', 'Numerical Ability',
                                                     'Verbal Ability', 'Spatial Reasoning')),
  text          text        NOT NULL,
  options       text[]      NOT NULL CHECK (cardinality(options) = 4),
  correct_index smallint    NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation   text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- 'c{contest_id}-q{position}', the format the frontend uses.
  CHECK (id = 'c' || contest_id || '-q' || position),
  UNIQUE (contest_id, position),
  -- Target for the composite FK from attempt_answers (§5.4).
  UNIQUE (contest_id, id)
);
CREATE TRIGGER contest_questions_updated_at BEFORE UPDATE ON contest_questions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Questions are locked once their contest opens (spec §3.2). The API checks
-- first and answers 409 contest_locked; this is the backstop.
CREATE FUNCTION contest_questions_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM contests
              WHERE opens_at <= now()
                AND id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.contest_id END,
                           CASE WHEN TG_OP <> 'DELETE' THEN NEW.contest_id END)) THEN
    RAISE EXCEPTION 'contest has opened; its questions are locked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER contest_questions_lock BEFORE INSERT OR UPDATE OR DELETE ON contest_questions
  FOR EACH ROW EXECUTE FUNCTION contest_questions_lock();
