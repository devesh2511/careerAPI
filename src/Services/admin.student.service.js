// Student accounts (user_metadata) as the admin panel sees them: with their
// phone, email, access result, the institute lists they're on, and the
// support actions admins take on them (deactivating, correcting name and
// phone, setting a password), each recorded in the account's history.
import { withTransaction } from '../Database/db.js';
import * as students from '../Database/student.repository.js';
import * as studentList from '../Database/studentList.repository.js';
import * as events from '../Database/studentEvent.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { StudentDTO } from '../DTO/StudentDTO.js';
import { accessFromFacts } from './access.service.js';
import { hashPassword } from './password.service.js';
import { keepOneSchool } from './oneSchool.service.js';

// r: a user_metadata row with its access facts.
const toAdminDTO = r => Object.assign(
  new StudentDTO(r, r.institute_name ? { name: r.institute_name, institute_code: r.institute_code, type: r.institute_type } : null),
  {
    is_deleted: r.is_deleted, deleted_at: r.deleted_at, last_login_at: r.last_login_at, access: accessFromFacts(r),
    deactivation: r.deactivated_at
      ? {
        reason: r.deactivation_reason, note: r.deactivation_note, deactivated_at: r.deactivated_at,
        by: r.deactivated_by ? { id: r.deactivated_by, full_name: r.deactivated_by_name ?? null } : null,
      }
      : null,
  });

// deactivated: only deactivated accounts (the admin's Deactivated tab).
export async function list({ deleted, deactivated = false, pattern }) {
  return (await students.listForAdmin({ deleted, deactivated, pattern })).map(toAdminDTO);
}

export async function get(studentId) {
  const row = await students.findForAdmin(studentId);
  if (!row) throw ApiError.notFound('student');
  const [lists, history, aliases] = await Promise.all([
    studentList.forAccount(studentId), events.listForStudent(studentId), events.aliasesFor(studentId),
  ]);
  const institutes = lists.map(i => ({
    id: i.id, name: i.name, institute_code: i.institute_code, type: i.type, is_deleted: i.is_deleted,
    registered_at: i.registered_at,
    subscription: i.subscription_ends_at ? { active: i.subscription_active, ends_at: i.subscription_ends_at } : null,
  }));
  return Object.assign(toAdminDTO(row), {
    institutes,
    old_details: aliases.map(a => ({ full_name: a.name, phone_no: a.phone_no, replaced_at: a.created_at })),
    history: history.map(e => ({
      kind: e.kind, note: e.note, data: e.data, created_at: e.created_at,
      admin: e.admin_id ? { id: e.admin_id, full_name: e.admin_name } : null,
    })),
  });
}

async function mustExist(studentId) {
  if (!(await students.exists(studentId))) throw ApiError.notFound('student');
}

// Soft: can't log in, restorable. Hard: the account and its app data are
// gone; their list rows stay and go back to unregistered.
export async function remove(studentId, mode) {
  await mustExist(studentId);
  await withTransaction(db => (mode === 'hard' ? students.hardDelete(studentId, db) : students.softDelete(studentId, db)));
}

export async function restore(studentId) {
  await mustExist(studentId);
  await students.restore(studentId);
}

// req: SetStudentPasswordRequest. Works on soft-deleted students too; they
// still can't log in until restored.
export async function setPassword(studentId, req, adminId) {
  await mustExist(studentId);
  const passwordHash = await hashPassword(req.password);
  await withTransaction(async db => {
    await students.setPassword(studentId, passwordHash, db);
    await events.insertEvent({ studentId, adminId, kind: 'password_set' }, db);
  });
}

// ── Deactivation ──────────────────────────────────────────────────────────
// req: DeactivateStudentRequest. → the student, as get() returns it.
//   malpractice: the whole account is locked (can't log in, off the
//     leaderboards, data kept) until an admin reactivates it.
//   left_institute: only that institute's list row goes; the account keeps
//     its other lists, and a later upload links it back.
export async function deactivate(studentId, req, adminId) {
  await withTransaction(async db => {
    const s = await students.findForUpdate(studentId, db);
    if (!s) throw ApiError.notFound('student');

    if (req.reason === 'malpractice') {
      if (s.deactivated_at) throw new ApiError(409, 'already_deactivated', 'This account is already deactivated.');
      await students.deactivate(studentId, { reason: 'malpractice', note: req.note, adminId }, db);
      await events.insertEvent({ studentId, adminId, kind: 'deactivated', note: req.note, data: { reason: 'malpractice' } }, db);
      return;
    }

    const row = (await studentList.forAccount(studentId, db)).find(i => i.id === req.instituteId);
    if (!row) throw ApiError.invalid("They aren't on that institute's list.", 'institute_id');
    await studentList.remove({ instituteId: row.id, name: s.name, phoneNo: s.phone_no }, db);
    await students.refreshInstitutes([studentId], db);
    await events.insertEvent({
      studentId, adminId, kind: 'left_institute', note: req.note,
      data: { institute: { id: row.id, name: row.name, institute_code: row.institute_code } },
    }, db);
  });
  return get(studentId);
}

// req: ReactivateStudentRequest. Lifts a malpractice deactivation.
export async function reactivate(studentId, req, adminId) {
  await withTransaction(async db => {
    const s = await students.findForUpdate(studentId, db);
    if (!s) throw ApiError.notFound('student');
    if (!s.deactivated_at) throw new ApiError(409, 'not_deactivated', "This account isn't deactivated.");
    await students.reactivate(studentId, db);
    await events.insertEvent({ studentId, adminId, kind: 'reactivated', note: req.note }, db);
  });
  return get(studentId);
}

// ── Name and phone ────────────────────────────────────────────────────────
// req: StudentDetailsRequest. The account and all its list rows take the new
// details; the old ones are kept so uploads still recognise them. Refused
// when the new details are another account's (never merged). Unlinked rows
// with the new details are this person: on a list the account is on they
// merge into its row, elsewhere they're linked to it (one school kept).
export async function editDetails(studentId, req, adminId) {
  await withTransaction(async db => {
    const s = await students.findForUpdate(studentId, db);
    if (!s) throw ApiError.notFound('student');
    const next = { name: req.name ?? s.name, phoneNo: req.phoneNo ?? s.phone_no };
    if (next.name === s.name && next.phoneNo === s.phone_no) return;
    // Matching ignores case, so a case-only change is the same person.
    const samePerson = next.phoneNo === s.phone_no && next.name.toLowerCase() === s.name.toLowerCase();

    // Unlinked rows under the current details are this person too: link them
    // first so the rename carries them along (else a later upload with the
    // old details would add a second row on that list).
    const preClaimed = await studentList.claimAllFor(studentId, { name: s.name, phoneNo: s.phone_no }, db);

    if (!samePerson) {
      const other = await students.findOtherByPerson(studentId, next, db);
      if (other) {
        const err = new ApiError(409, 'person_taken',
          `Another account (${other.username}) already has this name and phone number. Check it before changing these details.`,
          'full_name');
        err.details = { student: { id: other.id, username: other.username } };
        throw err;
      }
      await studentList.mergeUnlinkedInto(studentId, next, db);
    }
    await students.setPerson(studentId, next, db);

    let claimed = [];
    if (!samePerson) {
      await events.insertAlias({ studentId, name: s.name, phoneNo: s.phone_no, adminId }, db);
      await events.removeAlias({ studentId, ...next }, db);
      claimed = await studentList.claimAllFor(studentId, next, db);
    }
    if (claimed.length || preClaimed.length) {
      await keepOneSchool(studentId, [...claimed, ...preClaimed], { adminId, via: 'details_changed' }, db);
      await students.refreshInstitutes([studentId], db);
    }
    await events.insertEvent({
      studentId, adminId, kind: 'details_changed', note: req.note,
      data: {
        old: { full_name: s.name, phone_no: s.phone_no },
        new: { full_name: next.name, phone_no: next.phoneNo },
        linked_institute_ids: [...preClaimed, ...claimed],
      },
    }, db);
  });
  return get(studentId);
}
