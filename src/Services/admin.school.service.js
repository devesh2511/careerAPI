// Schools, their student email lists and the payments they make (schema §6).
import { withTransaction } from '../Database/db.js';
import * as schools from '../Database/school.repository.js';
import * as roster from '../Database/roster.repository.js';
import * as subscriptions from '../Database/subscription.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { SchoolDTO } from '../DTO/SchoolDTO.js';
import { SubscriptionDTO, guardDuplicatePayment } from '../DTO/SubscriptionDTO.js';
import { parseRoster } from '../DTO/admin.requests.js';

// A taken School ID or UDISE+ code becomes a 409 on that field.
async function guardUnique(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'schools_school_code_key') {
      throw new ApiError(409, 'school_code_taken', 'Another school already uses this School ID.', 'school_code');
    }
    if (err.code === '23505' && err.constraint === 'schools_udise_code_key') {
      throw new ApiError(409, 'udise_taken', 'A school with this UDISE+ code already exists.', 'udise_code');
    }
    throw err;
  }
}

async function mustExist(schoolId) {
  if (!(await schools.exists(schoolId))) throw ApiError.notFound('school');
}

export async function list({ deleted, pattern }) {
  return (await schools.listForAdmin({ deleted, pattern })).map(s => new SchoolDTO(s));
}

export async function get(schoolId) {
  const row = await schools.findForAdmin(schoolId);
  if (!row) throw ApiError.notFound('school');
  return new SchoolDTO(row);
}

// req: SchoolRequest.
export async function create(req, adminId) {
  return get(await guardUnique(() => schools.insert(req, adminId)));
}

export async function update(schoolId, req) {
  if (!(await guardUnique(() => schools.update(schoolId, req)))) throw ApiError.notFound('school');
  return get(schoolId);
}

export async function remove(schoolId, mode) {
  await mustExist(schoolId);
  await (mode === 'hard' ? schools.hardDelete(schoolId) : schools.softDelete(schoolId));
}

export async function restore(schoolId) {
  await mustExist(schoolId);
  await schools.restore(schoolId);
  return get(schoolId);
}

// ── Email list ────────────────────────────────────────────────────────────
export async function listRoster(schoolId) {
  await mustExist(schoolId);
  return (await roster.list(schoolId)).map(r => ({
    email: r.email,
    created_at: r.created_at,
    student: r.full_name ? { full_name: r.full_name, linked: r.student_school_id === schoolId } : null,
  }));
}

// CSV upload. Re-uploading is harmless; an email on another school's list
// is reported as a conflict instead of moving.
export async function uploadRoster(schoolId, text, adminId) {
  await mustExist(schoolId);
  const { emails, invalid } = parseRoster(text);
  const out = { added: [], already: [], conflicts: [], invalid };
  if (!emails.length) return out;

  return withTransaction(async db => {
    const listed = new Map((await roster.findListed(emails, db)).map(r => [r.email, r]));
    const fresh = [];
    for (const email of emails) {
      const hit = listed.get(email);
      if (!hit) fresh.push(email);
      else if (hit.school_id === schoolId) out.already.push(email);
      else out.conflicts.push({ email, school: hit.school_name });
    }
    if (fresh.length) {
      const added = new Set(await roster.insertMany(schoolId, fresh, adminId, db));
      // Any not inserted were added by a concurrent upload; re-read whose list.
      const raced = fresh.filter(e => !added.has(e));
      out.added = fresh.filter(e => added.has(e));
      for (const r of raced.length ? await roster.findListed(raced, db) : []) {
        if (r.school_id === schoolId) out.already.push(r.email);
        else out.conflicts.push({ email: r.email, school: r.school_name });
      }
    }
    return out;
  });
}

export async function removeFromRoster(schoolId, email) {
  await mustExist(schoolId);
  await roster.remove(schoolId, email);
}

// ── Payments ──────────────────────────────────────────────────────────────
export async function listSubscriptions(schoolId) {
  await mustExist(schoolId);
  return (await subscriptions.listForSchool(schoolId)).map(s => new SubscriptionDTO(s));
}

// req: SchoolSubscriptionRequest. Creates an active school_annual plan.
export async function recordPayment(schoolId, req) {
  await mustExist(schoolId);
  return new SubscriptionDTO(await guardDuplicatePayment(() => subscriptions.insertSchoolPlan(schoolId, req)));
}
