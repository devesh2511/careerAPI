-- Paid access periods, bought by a school or by one student (schema §6.3).
-- Payment records outlive the payer: hard-deleting a student or school
-- clears its id here instead of deleting the row (GST record-keeping).

CREATE TABLE subscriptions (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payer_type       text        NOT NULL CHECK (payer_type IN ('school', 'student')),
  school_id        integer     REFERENCES schools (id) ON DELETE SET NULL,
  student_id       uuid        REFERENCES students (id) ON DELETE SET NULL,
  plan             text        NOT NULL,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  amount_paise     integer     NOT NULL CHECK (amount_paise >= 0),
  currency         text        NOT NULL DEFAULT 'INR',
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed')),
  payment_provider text,
  payment_ref      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((payer_type = 'school' AND student_id IS NULL) OR (payer_type = 'student' AND school_id IS NULL)),
  CHECK (ends_at > starts_at),
  UNIQUE (payment_provider, payment_ref)
);
CREATE INDEX subscriptions_school_idx ON subscriptions (school_id, ends_at) WHERE status = 'active';
CREATE INDEX subscriptions_student_idx ON subscriptions (student_id, ends_at) WHERE status = 'active';
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
