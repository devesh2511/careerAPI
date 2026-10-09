// Students as the admin panel sees them: with their email and access result.
import { withTransaction } from '../Database/db.js';
import * as students from '../Database/student.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { StudentDTO } from '../DTO/StudentDTO.js';
import { accessFromFacts } from './access.service.js';
import { hashPassword } from './password.service.js';

export async function list({ deleted, pattern }) {
  const rows = await students.listForAdmin({ deleted, pattern });
  return rows.map(r => Object.assign(
    new StudentDTO(r, r.name ? { name: r.name, school_code: r.school_code } : null),
    { is_deleted: r.is_deleted, deleted_at: r.deleted_at, access: accessFromFacts(r) }));
}

async function mustExist(studentId) {
  if (!(await students.exists(studentId))) throw ApiError.notFound('student');
}

// Soft: can't log in, restorable. Hard: gone, payments kept without a payer.
export async function remove(studentId, mode) {
  await mustExist(studentId);
  if (mode === 'hard') await students.hardDelete(studentId);
  else await withTransaction(db => students.softDelete(studentId, db));
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
  const ok = await withTransaction(db => students.setPassword(studentId, passwordHash, db));
  if (!ok) throw new ApiError(409, 'no_password_login', 'This student has no password login.');
}
