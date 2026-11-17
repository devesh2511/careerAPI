// Student accounts (user_metadata) as the admin panel sees them: with their
// phone, email, access result and the institute lists they're on.
import { withTransaction } from '../Database/db.js';
import * as students from '../Database/student.repository.js';
import * as studentList from '../Database/studentList.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { StudentDTO } from '../DTO/StudentDTO.js';
import { accessFromFacts } from './access.service.js';
import { hashPassword } from './password.service.js';

// r: a user_metadata row with its access facts.
const toAdminDTO = r => Object.assign(
  new StudentDTO(r, r.institute_name ? { name: r.institute_name, institute_code: r.institute_code, type: r.institute_type } : null),
  { is_deleted: r.is_deleted, deleted_at: r.deleted_at, last_login_at: r.last_login_at, access: accessFromFacts(r) });

export async function list({ deleted, pattern }) {
  return (await students.listForAdmin({ deleted, pattern })).map(toAdminDTO);
}

export async function get(studentId) {
  const row = await students.findForAdmin(studentId);
  if (!row) throw ApiError.notFound('student');
  const institutes = (await studentList.forAccount(studentId)).map(i => ({
    id: i.id, name: i.name, institute_code: i.institute_code, type: i.type, is_deleted: i.is_deleted,
    registered_at: i.registered_at,
    subscription: i.subscription_ends_at ? { active: i.subscription_active, ends_at: i.subscription_ends_at } : null,
  }));
  return Object.assign(toAdminDTO(row), { institutes });
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
export async function setPassword(studentId, req) {
  await mustExist(studentId);
  const passwordHash = await hashPassword(req.password);
  await withTransaction(db => students.setPassword(studentId, passwordHash, db));
}
