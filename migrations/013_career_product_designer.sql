-- New career: Product Designer — how an everyday product looks, feels and
-- works, from packaging and gadgets to app screens. Sits in the 'design'
-- family after Animator / VFX Artist, so later careers move down one place.
-- The roadmap is also in career_roadmaps/product-designer.json.

-- Only on the first run: a second would move them down again.
UPDATE careers SET sort_order = sort_order + 1
 WHERE sort_order >= 65 AND NOT EXISTS (SELECT 1 FROM careers WHERE title = 'Product Designer');

INSERT INTO careers (title, emoji, field, family, stream, salary, riasec, domains, subjects, why, sort_order) VALUES
  ('Product Designer', '📐', 'Design + Product', 'design', 'Arts / PCM / Any', '₹5–12 LPA starting', '{"R":65,"I":65,"A":95,"S":50,"E":55,"C":45}'::jsonb, '["media","digital"]'::jsonb, '["arts","maths","computers"]'::jsonb, 'Deciding how an everyday product looks, feels and works, from a bottle to a phone app.', 65)
ON CONFLICT (title) DO NOTHING;

INSERT INTO career_roadmaps (career, emoji, steps) VALUES (
  'Product Designer', '📐',
  '[
    {"period": "Now · Class 10", "title": "Build your foundation", "actions": [
      "Sketch everyday objects daily — bottles, chairs, shoes, phones",
      "Notice what makes a product easy or annoying to use, and write down why",
      "Try free tools: Figma for screens, Tinkercad for 3D shapes",
      "Make quick models from cardboard, clay or paper"]},
    {"period": "Class 11–12", "title": "Any stream works · Start design entrance prep", "actions": [
      "B.Des accepts every stream — Maths and Physics help with how things are made",
      "Start UCEED and NID DAT prep in Class 11: drawing, observation, visual reasoning",
      "Keep a sketchbook and build a portfolio of 10–15 product ideas",
      "Join design, maker or tinkering contests at school and beyond"]},
    {"period": "Class 12 · Entrance Exams", "title": "Crack design entrances", "actions": [
      "UCEED for B.Des at IIT Bombay, IIT Delhi, IIT Guwahati, IIT Hyderabad and IIITDM Jabalpur",
      "NID DAT for the National Institute of Design campuses",
      "Also apply: NIFT (Accessory Design), MIT Institute of Design, Symbiosis (SEED)",
      "Prepare your portfolio for the studio test and interview rounds"]},
    {"period": "College · B.Des Product / Industrial Design (4 years)", "title": "NID · IIT Bombay IDC · IIT Delhi · NIFT · MIT-ID · Srishti", "actions": [
      "Learn sketching, 3D modelling (Fusion 360, SolidWorks, Blender) and prototyping",
      "Study materials, manufacturing, packaging and user research",
      "Intern at a design studio or product company after Year 2 or Year 3",
      "Build a portfolio that shows the full process — problem, sketches, prototypes, final product"]},
    {"period": "First Job", "title": "Junior Product Designer — ₹5–12 LPA starting", "actions": [
      "Roles at design studios, consumer brands, electronics, EV and app companies",
      "Top recruiters: Titan, Godrej, Tata Elxsi, Ather Energy, boAt, Flipkart, Swiggy",
      "Senior Product Designer at ₹15–30 LPA in 4–5 years"]}
  ]'::jsonb
)
ON CONFLICT (career) DO NOTHING;
