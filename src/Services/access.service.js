// The access check (schema §6.4). A student has access when their School
// ID's school is active, has an active plan and has their email on its
// list — or when they have an active individual plan of their own.
import { findAccessFacts } from '../Database/student.repository.js';
import { AccessDTO } from '../DTO/AccessDTO.js';

export async function accessFor(studentId, db) {
  const f = await findAccessFacts(studentId, db);
  const school = f.name ? { name: f.name, school_code: f.school_code } : null;

  if (school && f.school_live && f.on_roster && f.school_plan) return AccessDTO.granted('school', school, f.school_plan);
  if (f.own_plan) return AccessDTO.granted('individual', school, f.own_plan);

  if (!school) return AccessDTO.denied('no_school', null);
  return AccessDTO.denied(f.on_roster ? 'school_not_subscribed' : 'not_on_roster', school);
}
