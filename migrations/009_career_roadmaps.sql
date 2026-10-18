-- Career roadmaps: the timeline on app.html#/roadmap, one row per career.
-- `career` matches the career titles in the frontend's riasec_careers.js
-- (and students.current_career), so the page can open the student's top match.

CREATE TABLE IF NOT EXISTS career_roadmaps (
  career     text        PRIMARY KEY CHECK (length(career) BETWEEN 1 AND 80),
  emoji      text,
  -- Ordered stages, Class 10 to first job:
  -- [{"period": "Class 11–12", "title": "...", "actions": ["...", "..."]}, ...]
  steps      jsonb       NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) > 0),
  -- Order in the career picker; ties sort by career.
  sort_order integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The roadmap that used to be hard-coded in app.html.
INSERT INTO career_roadmaps (career, emoji, sort_order, steps) VALUES (
  'UI/UX Designer', '🎨', 0,
  '[
    {"period": "Now · Class 10", "title": "Build your foundation", "actions": [
      "Score well in Maths & Computer Science in boards",
      "Start using Figma (free) — watch beginner tutorials",
      "Build a small drawing portfolio (sketches, doodles)",
      "Explore UCEED exam pattern"]},
    {"period": "Class 11–12", "title": "Choose PCM + Computer Science · Build skills", "actions": [
      "Focus on Physics, Maths, CS — target 85%+",
      "Take online design courses (Coursera, YouTube)",
      "Enter school / inter-school design contests",
      "Prepare for UCEED & NID DAT entrance exams"]},
    {"period": "After Boards · Gap / Entrance Prep", "title": "Target design college entrances", "actions": [
      "Appear for UCEED (IITs), NID DAT, CEPT entrance",
      "Build a polished digital portfolio (Behance / Dribbble)",
      "Take a short UI/UX bootcamp if time permits"]},
    {"period": "College · B.Des (4 years)", "title": "NID · Symbiosis · Srishti · NIFT or B.Tech + Design Minor", "actions": [
      "Intern at a design studio after Year 2",
      "Freelance small projects for experience & income",
      "Build industry network via design meetups"]},
    {"period": "First Job", "title": "Junior UX Designer — ₹4–7 LPA starting", "actions": [
      "Apply to startups, design studios, product companies",
      "Top recruiters: Swiggy, Zomato, PhonePe, ThoughtWorks",
      "Senior Designer at ₹15–25 LPA in 4–5 years"]}
  ]'::jsonb
)
ON CONFLICT (career) DO NOTHING;
