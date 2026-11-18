// The access check. A student has access while any institute list they're
// on has a subscription covering now, from an active, undeleted institute.
// Without that, a student waiting on a join request is told so, and one on
// no list at all (left their institute) is told that.
import { findAccessFacts } from '../Database/student.repository.js';
import { AccessDTO } from '../DTO/AccessDTO.js';

export async function accessFor(studentId, db) {
  return accessFromFacts(await findAccessFacts(studentId, db));
}

// f: the access facts columns (student.repository.js → ACCESS_FACTS), with
// the account's institute_code.
export function accessFromFacts(f) {
  if (f.plan) return AccessDTO.granted(f.plan);
  if (f.pending) return AccessDTO.pending(f.pending);
  if (!f.on_list) return AccessDTO.noInstitute();
  return AccessDTO.denied(f.institute_name ? { name: f.institute_name, institute_code: f.institute_code } : null);
}
