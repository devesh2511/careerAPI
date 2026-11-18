// One school per student: a student may be on any number of coaching,
// tuition and other lists, but on at most one school's list. Whatever
// links an account to a school (an upload, a link, an approved request,
// registration, an admin correcting their details) keeps the newly linked
// school and takes them off the others. Every move is recorded in the
// account's history (student_events kind moved_school).
//
// List uploads do this in bulk (admin.institute.service.js → uploadStudents);
// this is the one-account version.
import * as studentList from '../Database/studentList.repository.js';
import { insertEvent } from '../Database/studentEvent.repository.js';

const ref = r => ({ id: r.institute_id, name: r.institute_name, institute_code: r.institute_code });

// Records that `row` (another school's) was dropped in favour of `kept`.
export async function logMove(studentId, row, kept, { adminId = null, via }, db) {
  await insertEvent({
    studentId, adminId, kind: 'moved_school', note: null,
    data: { via, from: ref(row), to: kept ? ref(kept) : null },
  }, db);
}

// Leaves the account on one school: keep (an institute id, or several in
// order of preference) if that's one of its schools, else the most recently
// uploaded. Unlinked rows on other schools
// that are this person go too. → the rows removed. The caller refreshes
// the account's institute.
export async function keepOneSchool(studentId, keep, { adminId = null, via }, db) {
  const rows = await studentList.schoolRowsFor(studentId, db);
  const linked = rows.filter(r => r.metadata_id === studentId);
  if (!linked.length) return [];
  const prefer = [].concat(keep ?? []);
  const kept = prefer.map(id => linked.find(r => r.institute_id === id)).find(Boolean) || linked[0];
  const drop = rows.filter(r => r.institute_id !== kept.institute_id);
  if (!drop.length) return [];
  await studentList.removeRows(drop, db);
  for (const r of drop) if (r.metadata_id === studentId) await logMove(studentId, r, kept, { adminId, via }, db);
  return drop;
}
