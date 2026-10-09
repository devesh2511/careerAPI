// Students as the admin panel sees them: with their email and access
// result, and the individual payments an admin records for them.
import { withTransaction } from '../Database/db.js';
import * as students from '../Database/student.repository.js';
import * as subscriptions from '../Database/subscription.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { StudentDTO } from '../DTO/StudentDTO.js';
import { SubscriptionDTO, guardDuplicatePayment } from '../DTO/SubscriptionDTO.js';
import { accessFromFacts } from './access.service.js';
import { hashPassword } from './password.service.js';

// r: a students row with its access facts.
const toAdminDTO = r => Object.assign(
  new StudentDTO(r, r.name ? { name: r.name, school_code: r.school_code } : null),
  { is_deleted: r.is_deleted, deleted_at: r.deleted_at, access: accessFromFacts(r) });

export async function list({ deleted, pattern }) {
  return (await students.listForAdmin({ deleted, pattern })).map(toAdminDTO);
}

export async function get(studentId) {
  const row = await students.findForAdmin(studentId);
  if (!row) throw ApiError.notFound('student');
  return toAdminDTO(row);
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

// ── Payments ──────────────────────────────────────────────────────────────
export async function listSubscriptions(studentId) {
  await mustExist(studentId);
  return (await subscriptions.listForStudent(studentId)).map(s => new SubscriptionDTO(s));
}

// req: StudentSubscriptionRequest. Students pay outside the website; this
// records the payment as an active individual plan.
export async function recordPayment(studentId, req) {
  await mustExist(studentId);
  return new SubscriptionDTO(await guardDuplicatePayment(() => subscriptions.insertStudentPlan(studentId, req)));
}
