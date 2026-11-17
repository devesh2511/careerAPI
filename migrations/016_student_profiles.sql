-- The student's onboarding answers (docs/openapi.yaml → Profile), one row
-- per student. class, board and city are asked at registration and live on
-- user_metadata; GET /me/profile returns them together with these. PUT
-- /me/profile creates the row on the first answer and later saves fill in
-- the rest.

CREATE TABLE IF NOT EXISTS student_profiles (
  student_id         integer     PRIMARY KEY REFERENCES user_metadata (id) ON DELETE CASCADE,
  medium             text        CHECK (medium IN ('English', 'Hindi', 'Regional Language')),
  -- {"Mathematics": 87, "Science": 79}, each 0-100.
  marks              jsonb       CHECK (jsonb_typeof(marks) = 'object'),
  favourite_subjects jsonb       CHECK (jsonb_typeof(favourite_subjects) = 'array'),
  hobbies            jsonb       CHECK (jsonb_typeof(hobbies) = 'array'),
  dream_job          text        CHECK (length(dream_job) BETWEEN 1 AND 80),
  career_preference  text        CHECK (career_preference IN ('Private Sector', 'Government Job', 'Entrepreneur')),
  study_location     text        CHECK (study_location IN ('Yes, anywhere', 'Same state only', 'Prefer home city')),
  -- Set once, the first time the last onboarding step (aspirations) is saved.
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE TRIGGER student_profiles_updated_at BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
