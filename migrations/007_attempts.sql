-- Students' contest attempts and their saved answers (schema §5.3, §5.4).

CREATE TABLE attempts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id     integer     NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  student_id     uuid        NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  submitted_at   timestamptz,
  auto_submitted boolean     NOT NULL DEFAULT false,
  -- Filled by the close job (schema §9); time_taken_s also at submit.
  correct        smallint    CHECK (correct BETWEEN 0 AND 5),
  score          smallint,
  time_taken_s   integer     CHECK (time_taken_s >= 1),
  -- One attempt per student per contest; Start resumes it.
  UNIQUE (contest_id, student_id),
  -- Target for the composite FK from attempt_answers.
  UNIQUE (id, contest_id),
  CHECK (submitted_at IS NULL OR submitted_at >= started_at),
  CHECK ((score IS NULL) = (correct IS NULL) AND (score IS NULL OR score = correct * 10))
);
CREATE INDEX attempts_ranking_idx ON attempts (contest_id, score DESC, time_taken_s)
  WHERE submitted_at IS NOT NULL;
CREATE INDEX attempts_student_id_idx ON attempts (student_id);

CREATE TABLE attempt_answers (
  attempt_id   uuid        NOT NULL,
  contest_id   integer     NOT NULL,
  question_id  text        NOT NULL,
  option_index smallint    NOT NULL CHECK (option_index BETWEEN 0 AND 3),
  answered_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id),
  -- Together these make an answer to another contest's question impossible.
  FOREIGN KEY (attempt_id, contest_id) REFERENCES attempts (id, contest_id) ON DELETE CASCADE,
  FOREIGN KEY (contest_id, question_id) REFERENCES contest_questions (contest_id, id) ON DELETE CASCADE
);
