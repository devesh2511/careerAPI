-- Career quiz runs: only each student's latest 2 are kept (the API deletes
-- older ones on save); the latest is shown on login (schema §4.2).

CREATE TABLE career_quiz_results (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id     uuid        NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  -- Rounded 0-100 per dimension, e.g. {"R":22,"I":35,"A":15,"S":5,"E":35,"C":23}.
  riasec_pct     jsonb       NOT NULL CHECK (jsonb_typeof(riasec_pct) = 'object'),
  riasec_code    text        NOT NULL CHECK (riasec_code ~ '^[RIASEC]{1,3}$'),
  -- riasec_engine.js reports confidence as a label, not a number.
  confidence     text        CHECK (confidence IN ('high', 'medium', 'low')),
  top_career     text        NOT NULL CHECK (length(top_career) BETWEEN 1 AND 80),
  -- The full appResults object, so the results page re-renders as-is.
  results        jsonb       NOT NULL CHECK (jsonb_typeof(results) = 'object'),
  -- Raw cqAnswers, so a run can be re-scored if the engine changes.
  answers        jsonb,
  engine_version text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX career_quiz_results_latest_idx ON career_quiz_results (student_id, created_at DESC);
