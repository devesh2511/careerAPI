// Admin accounts. There's no sign-up: admins add each other.
import { withTransaction } from '../Database/db.js';
import * as admins from '../Database/admin.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { AdminDTO } from '../DTO/AdminDTO.js';
import { hashPassword } from './password.service.js';

export async function list(deleted, meId) {
  return (await admins.list(deleted)).map(a => new AdminDTO(a, meId));
}

// req: CreateAdminRequest.
export async function create(req) {
  const passwordHash = await hashPassword(req.password);
  try {
    const { id } = await admins.insert({ email: req.email, fullName: req.fullName, passwordHash });
    return { id };
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'admins_email_key') {
      throw new ApiError(409, 'email_taken', 'An admin with this email already exists.', 'email');
    }
    throw err;
  }
}

export async function remove(adminId, mode, meId) {
  if (adminId === meId) throw new ApiError(409, 'cannot_delete_self', "You can't delete your own admin account.");
  if (!(await admins.exists(adminId))) throw ApiError.notFound('admin');
  if (mode === 'hard') await admins.hardDelete(adminId);
  else await withTransaction(db => admins.softDelete(adminId, db));
}

export async function restore(adminId) {
  if (!(await admins.restore(adminId))) throw ApiError.notFound('admin');
}
