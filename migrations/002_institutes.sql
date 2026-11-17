-- Institutes (schools, tuition centres…), the payments they make and the
-- subscriptions those payments cover (account_subscription_er_diagram.png).
--
-- Order of events: the admin creates the institute, uploads its student list
-- with a headcount and dates (that creates the subscription), and records the
-- payment afterwards, which fills subscription.payment_id.

CREATE TABLE IF NOT EXISTS institute (
  id              integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- What students type when they register. Stored upper-case.
  institute_code  text        NOT NULL UNIQUE CHECK (institute_code ~ '^[A-Z0-9-]{3,20}$'),
  -- 'school' wins when a student is on more than one institute's list.
  type            text        NOT NULL CHECK (type IN ('school', 'tuition', 'coaching', 'other')),
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  address         text,
  city            text        NOT NULL CHECK (length(city) BETWEEN 1 AND 80),
  contact_details text,
  -- Not in the diagram: lets the admin pause an institute or soft-delete it
  -- without losing its list.
  status          text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_by      uuid        REFERENCES admins (id) ON DELETE SET NULL,
  is_deleted      boolean     NOT NULL DEFAULT false,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (is_deleted = (deleted_at IS NOT NULL))
);
CREATE OR REPLACE TRIGGER institute_updated_at BEFORE UPDATE ON institute
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Payment records outlive the payer: hard-deleting an institute clears its
-- id here instead of deleting the row (GST record-keeping).
CREATE TABLE IF NOT EXISTS payments (
  id              integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The bank / UPI reference. Text, not a number: UPI references are 12
  -- digits and others contain letters.
  transaction_id  text        UNIQUE CHECK (length(transaction_id) BETWEEN 1 AND 100),
  institute_id    integer     REFERENCES institute (id) ON DELETE SET NULL,
  mode_of_payment text        NOT NULL CHECK (length(mode_of_payment) BETWEEN 1 AND 40),
  amount          numeric(12, 2) NOT NULL CHECK (amount >= 0),
  date_of_payment date        NOT NULL,
  recorded_by     uuid        REFERENCES admins (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_institute_id_idx ON payments (institute_id);

CREATE TABLE IF NOT EXISTS subscription (
  id           integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institute_id integer     NOT NULL REFERENCES institute (id) ON DELETE CASCADE,
  -- One payment pays for one subscription. NULL until the payment is recorded.
  payment_id   integer     UNIQUE REFERENCES payments (id) ON DELETE SET NULL,
  head_count   integer     NOT NULL CHECK (head_count > 0),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  created_by   uuid        REFERENCES admins (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS subscription_institute_idx ON subscription (institute_id, ends_at);
