-- Schools and the student email list each school provides (schema §6.1, §6.2).

CREATE TABLE schools (
  id            integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text        NOT NULL,
  school_code   text        NOT NULL UNIQUE CHECK (school_code ~ '^[A-Z0-9-]{3,20}$'),
  udise_code    text        UNIQUE CHECK (udise_code IS NULL OR udise_code ~ '^[0-9]{11}$'),
  board         text        CHECK (board IN ('CBSE', 'ICSE', 'State Board')),
  city          text        NOT NULL,
  state         text        NOT NULL,
  status        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  contact_name  text        NOT NULL,
  contact_email text        NOT NULL,
  contact_phone text,
  created_by    uuid        REFERENCES admins (id) ON DELETE SET NULL,
  is_deleted    boolean     NOT NULL DEFAULT false,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (is_deleted = (deleted_at IS NOT NULL))
);
CREATE TRIGGER schools_updated_at BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE school_roster (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id  integer     NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  email      text        NOT NULL,
  added_by   uuid        REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- An email can be on one school's list only.
CREATE UNIQUE INDEX school_roster_email_key ON school_roster (lower(email));
CREATE INDEX school_roster_school_id_idx ON school_roster (school_id);
