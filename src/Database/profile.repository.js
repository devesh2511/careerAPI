// Queries on student_profiles (the onboarding answers).
import { db as defaultDb } from './db.js';

const JSON_COLUMNS = ['marks', 'favourite_subjects', 'hobbies'];
const COLUMNS = ['class', 'board', 'medium', 'city', 'marks', 'favourite_subjects', 'hobbies',
  'dream_job', 'career_preference', 'study_location'];

export async function findByStudent(studentId, db = defaultDb) {
  const { rows } = await db.query('SELECT * FROM student_profiles WHERE student_id = $1', [studentId]);
  return rows[0] || null;
}

// Creates the row or updates only the given columns. completed_at is set
// the first time an aspirations answer (the last onboarding step) arrives.
export async function upsert(studentId, fields, db = defaultDb) {
  const cols = COLUMNS.filter(c => c in fields);
  const values = cols.map(c => (JSON_COLUMNS.includes(c) && fields[c] !== null ? JSON.stringify(fields[c]) : fields[c]));
  const finishing = 'career_preference' in fields || 'study_location' in fields;
  const { rows } = await db.query(
    `INSERT INTO student_profiles (student_id, ${cols.join(', ')}, completed_at)
     VALUES ($1, ${cols.map((_, i) => '$' + (i + 2)).join(', ')}, ${finishing ? 'now()' : 'NULL'})
     ON CONFLICT (student_id) DO UPDATE SET
       ${cols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}
       ${finishing ? ', completed_at = COALESCE(student_profiles.completed_at, now())' : ''}
     RETURNING *`,
    [studentId, ...values]);
  return rows[0];
}
