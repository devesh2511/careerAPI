-- My Career Space (app.html#/space): the latest news, jobs, exams and
-- scholarships for each of the student's top career matches, pulled live
-- from the news providers in src/Services/news/providers/.
--
-- careers.news_terms — what a news search for this career looks for, e.g.
--   ["robotics", "mechatronics"]. Career titles make poor search terms
--   ("Robotics & Mechatronics Engineer" barely appears in headlines).
-- careers.exam_terms — the entrance exams on the way into it, e.g.
--   ["JEE Main", "JEE Advanced"]; the Exams & Admissions tab searches them too.
-- A career with no terms (one added later) falls back to its title.

ALTER TABLE careers
  ADD COLUMN IF NOT EXISTS news_terms jsonb CHECK (jsonb_typeof(news_terms) = 'array'),
  ADD COLUMN IF NOT EXISTS exam_terms jsonb CHECK (jsonb_typeof(exam_terms) = 'array');

-- Only fills careers that have no terms yet, so a second run (or terms an
-- admin changed later) is left alone.
UPDATE careers c SET news_terms = t.news::jsonb, exam_terms = t.exams::jsonb
  FROM (VALUES
    ('Computer Science Engineer (Software & Systems)', '["computer science", "software engineering"]', '["JEE Main", "JEE Advanced", "BITSAT"]'),
    ('AI & Machine Learning Engineer', '["artificial intelligence", "machine learning"]', '["JEE Main", "JEE Advanced"]'),
    ('Data Scientist / Data Analyst', '["data science", "data analytics"]', '["JEE Main", "CUET"]'),
    ('Cybersecurity Specialist / Ethical Hacker', '["cybersecurity", "ethical hacking"]', '["JEE Main", "CUET"]'),
    ('Cloud Computing & DevOps Engineer', '["cloud computing", "DevOps"]', '["JEE Main"]'),
    ('Blockchain Developer', '["blockchain"]', '["JEE Main"]'),
    ('Full-Stack Web Developer', '["web development", "full stack developer"]', '["JEE Main", "CUET"]'),
    ('Big Data Engineer', '["big data", "data engineering"]', '["JEE Main"]'),
    ('UI/UX Designer', '["UX design", "UI design"]', '["UCEED", "NID DAT"]'),
    ('Robotics & Mechatronics Engineer', '["robotics", "mechatronics"]', '["JEE Main", "JEE Advanced"]'),
    ('Mechanical Engineer', '["mechanical engineering"]', '["JEE Main", "JEE Advanced"]'),
    ('Civil Engineer', '["civil engineering", "infrastructure projects"]', '["JEE Main", "JEE Advanced"]'),
    ('Electrical & Electronics Engineer', '["electrical engineering", "electronics engineering", "semiconductor"]', '["JEE Main", "JEE Advanced"]'),
    ('Aerospace Engineer', '["aerospace", "ISRO"]', '["JEE Advanced", "IIST"]'),
    ('Chemical Engineer', '["chemical engineering"]', '["JEE Main", "JEE Advanced"]'),
    ('Biomedical Engineer', '["biomedical engineering", "medical devices"]', '["JEE Main", "NEET UG"]'),
    ('Petroleum Engineer', '["petroleum engineering", "oil and gas"]', '["JEE Main"]'),
    ('Environmental & Sustainability Engineer', '["environmental engineering", "sustainability", "renewable energy"]', '["JEE Main"]'),
    ('Marine Engineer', '["marine engineering", "shipbuilding"]', '["IMU CET"]'),
    ('Genetic / Biotechnology Engineer', '["biotechnology", "genetic engineering"]', '["JEE Main", "NEET UG"]'),
    ('Drone Technology Specialist', '["drone technology", "drones"]', '["JEE Main"]'),
    ('Architect', '["architecture", "architects"]', '["NATA", "JEE Main Paper 2"]'),
    ('Merchant Navy Officer / Engineer', '["merchant navy", "shipping industry"]', '["IMU CET"]'),
    ('Commercial Pilot', '["commercial pilot", "aviation"]', '["DGCA", "IGRUA"]'),
    ('MBBS Doctor / Surgeon', '["MBBS", "medical college", "doctors"]', '["NEET UG"]'),
    ('Dentist', '["dentistry", "BDS"]', '["NEET UG"]'),
    ('Ayurvedic Physician', '["Ayurveda", "BAMS"]', '["NEET UG", "AYUSH"]'),
    ('Homeopathic Doctor', '["homeopathy", "BHMS"]', '["NEET UG", "AYUSH"]'),
    ('Anesthesiologist', '["anaesthesiology", "anesthesia"]', '["NEET UG", "NEET PG"]'),
    ('Veterinary Doctor', '["veterinary"]', '["NEET UG"]'),
    ('Pharmacist / Clinical Pharmacologist', '["pharmacy", "pharmacist"]', '["NEET UG", "GPAT"]'),
    ('Physiotherapist', '["physiotherapy"]', '["NEET UG"]'),
    ('Occupational Therapist', '["occupational therapy"]', '["NEET UG"]'),
    ('Registered Nurse', '["nursing", "nurses"]', '["NEET UG", "AIIMS nursing"]'),
    ('Medical Laboratory Technologist', '["medical laboratory", "pathology lab"]', '["CUET", "NEET UG"]'),
    ('Nutritionist / Dietitian', '["nutrition", "dietitian"]', '["CUET"]'),
    ('Healthcare Administrator / Hospital Manager', '["hospital management", "healthcare management"]', '["CUET", "CAT"]'),
    ('Clinical Psychologist', '["psychology", "mental health"]', '["CUET"]'),
    ('Forensic Science Investigator', '["forensic science"]', '["CUET", "NFSU"]'),
    ('Biotechnologist / Research Scientist', '["biotechnology research", "life sciences"]', '["NEET UG", "IISER"]'),
    ('Chartered Accountant (CA)', '["chartered accountant", "ICAI"]', '["CA Foundation"]'),
    ('Company Secretary (CS)', '["company secretary", "ICSI"]', '["CSEET"]'),
    ('Cost & Management Accountant (CMA)', '["cost accountant", "ICMAI"]', '["CMA Foundation"]'),
    ('Investment Banker', '["investment banking"]', '["CUET", "CAT"]'),
    ('Financial Analyst / Wealth Manager', '["financial analyst", "wealth management"]', '["CFA", "CUET"]'),
    ('Actuarial Scientist', '["actuarial", "actuary"]', '["ACET"]'),
    ('Stock Broker / Equity Research Analyst', '["stock market", "equity research"]', '["NISM", "CUET"]'),
    ('Product Manager', '["product management", "product manager"]', '["CAT", "IPMAT"]'),
    ('Digital Marketing Specialist', '["digital marketing"]', '["CUET", "IPMAT"]'),
    ('Retail & E-Commerce Manager', '["e-commerce", "retail industry"]', '["CUET", "IPMAT"]'),
    ('Business Analytics Consultant', '["business analytics", "management consulting"]', '["CUET", "IPMAT"]'),
    ('Entrepreneur / Startup Founder', '["startups", "entrepreneurship"]', '["IPMAT", "CUET"]'),
    ('Human Resources (HR) Manager', '["human resources", "HR professionals"]', '["CUET", "CAT"]'),
    ('Supply Chain & Logistics Manager', '["supply chain", "logistics"]', '["CUET", "CAT"]'),
    ('Hotel / Hospitality Manager', '["hospitality industry", "hotel management"]', '["NCHM JEE"]'),
    ('Event Manager', '["event management"]', '["CUET"]'),
    ('Advocate / Corporate Lawyer / Judge', '["lawyers", "law firms", "Supreme Court"]', '["CLAT", "AILET"]'),
    ('Journalist / News Anchor', '["journalism", "journalists"]', '["IIMC", "CUET"]'),
    ('Mass Communication & PR Specialist', '["public relations", "mass communication"]', '["IIMC", "CUET"]'),
    ('Content Creator / Copywriter', '["content creators", "copywriting"]', '["CUET"]'),
    ('Photographer / Videographer', '["photography", "filmmaking"]', '["FTII JET", "NID DAT"]'),
    ('Graphic Designer', '["graphic design"]', '["NID DAT", "UCEED"]'),
    ('Fashion Designer', '["fashion design", "fashion industry"]', '["NIFT", "NID DAT"]'),
    ('Interior Designer', '["interior design"]', '["NID DAT", "UCEED", "NATA"]'),
    ('Animator / VFX Artist', '["animation", "VFX"]', '["NID DAT", "UCEED"]'),
    ('Economist', '["economists", "economic policy"]', '["CUET"]'),
    ('Sociologist / Social Worker', '["social work", "sociology", "NGO"]', '["CUET"]'),
    ('Historian / Archaeologist', '["archaeology", "historians", "excavation"]', '["CUET"]'),
    ('Political Scientist / Policy Analyst', '["public policy", "political science"]', '["CUET"]'),
    ('Foreign Language Translator / Interpreter', '["translators", "interpreters", "language translation"]', '["CUET"]'),
    ('Civil Services Officer (IAS / IPS / IFS)', '["UPSC", "IAS officer"]', '["UPSC CSE"]'),
    ('Defence Services Officer (Army / Navy / Air Force)', '["Indian Army", "Indian Navy", "Indian Air Force"]', '["NDA", "CDS"]'),
    ('Public Sector Undertaking (PSU) Executive', '["PSU recruitment", "public sector undertaking"]', '["GATE"]'),
    ('Bank PO / RBI Grade B Officer', '["bank PO", "RBI Grade B", "banking jobs"]', '["IBPS PO", "SBI PO"]'),
    ('Professor / Academic Researcher', '["professors", "academic research"]', '["UGC NET", "CSIR NET"]'),
    ('Product Designer', '["product design", "industrial design"]', '["UCEED", "NID DAT"]')
  ) AS t (title, news, exams)
 WHERE c.title = t.title AND c.news_terms IS NULL;

-- The last feed fetched for each career, so a page view doesn't call every
-- provider. Refreshed when older than NEWS_CACHE_HOURS (news.service.js).
CREATE TABLE IF NOT EXISTS career_news (
  career     text        PRIMARY KEY REFERENCES careers (title) ON UPDATE CASCADE ON DELETE CASCADE,
  -- { "news": [NewsItem], "jobs": [...], "exams": [...], "scholarships": [...] }
  feed       jsonb       NOT NULL CHECK (jsonb_typeof(feed) = 'object'),
  -- Names of the providers that answered, e.g. ["GNews", "Google News"].
  sources    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
