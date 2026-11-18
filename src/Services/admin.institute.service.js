// Institutes, their student lists, subscriptions and payments, as the admin
// panel manages them.
//
// A list upload is all or nothing: any bad row, or more students than the
// headcount, and nothing is added (the admin tells the institute). A good
// upload creates a subscription for the headcount and dates, and puts every
// student in the file on it. Students already on the list (a renewal) move to
// the new subscription (so a renewal can't start in the future while their
// current one still covers them). The payment is recorded afterwards.
import { withTransaction } from '../Database/db.js';
import * as institutes from '../Database/institute.repository.js';
import * as studentList from '../Database/studentList.repository.js';
import * as subscriptions from '../Database/subscription.repository.js';
import * as joinRequests from '../Database/joinRequest.repository.js';
import { refreshInstitutes } from '../Database/student.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { InstituteDTO } from '../DTO/InstituteDTO.js';
import { SubscriptionDTO, PaymentDTO, guardDuplicatePayment } from '../DTO/SubscriptionDTO.js';
import { parseStudentList } from './studentList.parser.js';
import { accessFor } from './access.service.js';

// A taken institute ID becomes a 409 on that field.
async function guardUnique(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'institute_institute_code_key') {
      throw new ApiError(409, 'institute_code_taken', 'Another institute already uses this institute ID.', 'institute_code');
    }
    throw err;
  }
}

async function mustExist(instituteId) {
  if (!(await institutes.exists(instituteId))) throw ApiError.notFound('institute');
}

export async function list({ deleted, pattern }) {
  return (await institutes.listForAdmin({ deleted, pattern })).map(r => new InstituteDTO(r));
}

export async function get(instituteId) {
  const row = await institutes.findForAdmin(instituteId);
  if (!row) throw ApiError.notFound('institute');
  return new InstituteDTO(row);
}

// req: InstituteRequest.
export async function create(req, adminId) {
  return get(await guardUnique(() => institutes.insert(req, adminId)));
}

export async function update(instituteId, req) {
  const ok = await guardUnique(() => withTransaction(db => institutes.update(instituteId, req, db)));
  if (!ok) throw ApiError.notFound('institute');
  return get(instituteId);
}

// The accounts on its list may show another institute afterwards.
export async function remove(instituteId, mode) {
  await mustExist(instituteId);
  await withTransaction(async db => {
    const linked = await studentList.linkedAccounts(instituteId, db);
    await (mode === 'hard' ? institutes.hardDelete(instituteId, db) : institutes.softDelete(instituteId, db));
    await refreshInstitutes(linked, db);
  });
}

export async function restore(instituteId) {
  await mustExist(instituteId);
  await withTransaction(async db => {
    await institutes.restore(instituteId, db);
    await refreshInstitutes(await studentList.linkedAccounts(instituteId, db), db);
  });
  return get(instituteId);
}

// ── Student list ──────────────────────────────────────────────────────────
export async function listStudents(instituteId) {
  await mustExist(instituteId);
  return (await studentList.list(instituteId)).map(r => ({
    full_name: r.name,
    phone_no: r.phone_no,
    status: r.status,
    registered_at: r.registered_at,
    created_at: r.created_at,
    student: r.student_id ? { id: r.student_id, username: r.username } : null,
    subscription: r.subscription_id
      ? { id: r.subscription_id, active: r.subscription_active, ends_at: r.subscription_ends_at }
      : null,
  }));
}

// buf: the uploaded .xlsx / .csv. q: StudentListUploadQuery.
export async function uploadStudents(instituteId, buf, q, adminId) {
  const institute = await institutes.findForAdmin(instituteId);
  if (!institute) throw ApiError.notFound('institute');
  if (institute.is_deleted) throw new ApiError(409, 'institute_deleted', 'Restore this institute before uploading a list.');

  const { rows, errors } = await parseStudentList(buf);
  if (errors.length) {
    const err = new ApiError(422, 'invalid_rows',
      `${errors.length} row${errors.length === 1 ? ' has' : 's have'} a problem, so nothing was added. Fix the file and upload it again.`);
    err.details = { errors };
    throw err;
  }
  if (rows.length > q.headCount) {
    const err = new ApiError(422, 'headcount_exceeded',
      `The file has ${rows.length} students but the headcount is ${q.headCount}, so nothing was added.`, 'head_count');
    err.details = { rows: rows.length, head_count: q.headCount };
    throw err;
  }

  return withTransaction(async db => {
    // Students already on the list move to the new subscription. If it starts
    // later while their current one still covers them, moving them now would
    // cut them off until then.
    if (q.startsAt > new Date()) {
      const covered = await studentList.countCoveredNow(instituteId, rows, db);
      if (covered) {
        throw new ApiError(409, 'renewal_too_early',
          `${covered} student${covered === 1 ? ' in this file is' : 's in this file are'} still on a current subscription, ` +
          'so a renewal that starts later would cut them off until then. Upload it once the current one ends, ' +
          'or start it today. Nothing was added.', 'starts_at');
      }
    }
    const sub = await subscriptions.insert({
      instituteId, headCount: q.headCount, startsAt: q.startsAt, endsAt: q.endsAt, adminId,
    }, db);
    const { added, renewed } = await studentList.upsertMany(instituteId, rows, sub.id, adminId, db);
    return { subscription: new SubscriptionDTO({ ...sub, students: rows.length }), rows: rows.length, added, renewed };
  });
}

// key: ListRowQuery. Its account (if any) keeps existing, without this institute.
export async function removeStudent(instituteId, key) {
  await mustExist(instituteId);
  await withTransaction(async db => {
    const linked = await studentList.remove({ instituteId, name: key.name, phoneNo: key.phoneNo }, db);
    if (linked === undefined) throw ApiError.notFound('student');
    if (linked) await refreshInstitutes([linked], db);
  });
}

// ── Join requests ─────────────────────────────────────────────────────────
// Students not on the list of an institute with accepts_requests, asking to
// join it. Their account exists already; approving is what activates it.
export async function listRequests(instituteId) {
  await mustExist(instituteId);
  return (await joinRequests.listForInstitute(instituteId)).map(r => ({
    id: r.id,
    requested_at: r.created_at,
    full_name: r.name,
    phone_no: r.phone_no,
    student: {
      id: r.student_id, username: r.username, email: r.email, class: r.class, board: r.board, city: r.city,
      is_deleted: r.is_deleted,
    },
  }));
}

// Adds them to the list, registered and on the institute's current
// subscription (so they have access straight away), and deletes the request.
// The headcount isn't enforced here: the result says when it's exceeded.
export async function approveRequest(instituteId, requestId, adminId) {
  const institute = await institutes.findForAdmin(instituteId);
  if (!institute) throw ApiError.notFound('institute');
  if (institute.is_deleted) throw new ApiError(409, 'institute_deleted', 'Restore this institute before approving requests.');
  return withTransaction(async db => {
    const r = await joinRequests.findForUpdate(instituteId, requestId, db);
    if (!r) throw ApiError.notFound('request');
    const sub = await subscriptions.findCurrent(instituteId, db);
    if (!sub) {
      throw new ApiError(409, 'no_current_subscription',
        "This institute has no subscription covering today, so approving wouldn't activate the account. " +
        'Upload a student list (that creates one), then approve.');
    }
    await studentList.addRegistered({
      instituteId, name: r.name, phoneNo: r.phone_no, studentId: r.metadata_id, subscriptionId: sub.id, adminId,
    }, db);
    await joinRequests.remove(r.id, db);
    await refreshInstitutes([r.metadata_id], db);
    const students = sub.students + 1;
    return {
      // has_access false if the institute is suspended (or they were uploaded
      // meanwhile onto a subscription that isn't current).
      student: { id: r.metadata_id, username: r.username, has_access: (await accessFor(r.metadata_id, db)).has_access },
      subscription: { id: sub.id, head_count: sub.head_count, students, ends_at: sub.ends_at },
      over_headcount: students > sub.head_count,
    };
  });
}

// Deletes the request. The account stays, without this institute.
export async function rejectRequest(instituteId, requestId) {
  await mustExist(instituteId);
  await withTransaction(async db => {
    if (!(await joinRequests.findForUpdate(instituteId, requestId, db))) throw ApiError.notFound('request');
    await joinRequests.remove(requestId, db);
  });
}

// ── Subscriptions and payments ────────────────────────────────────────────
export async function listSubscriptions(instituteId) {
  await mustExist(instituteId);
  return (await subscriptions.listForInstitute(instituteId)).map(s => new SubscriptionDTO(s));
}

export async function listPayments(instituteId) {
  await mustExist(instituteId);
  return (await subscriptions.listPayments(instituteId)).map(p => new PaymentDTO(p));
}

// req: PaymentRequest. Records the payment and attaches it to its subscription.
export async function recordPayment(instituteId, req, adminId) {
  await mustExist(instituteId);
  return withTransaction(async db => {
    const sub = await subscriptions.findForUpdate(instituteId, req.subscriptionId, db);
    if (!sub) throw ApiError.invalid("That subscription isn't this institute's.", 'subscription_id');
    if (sub.payment_id) {
      throw new ApiError(409, 'already_paid', 'This subscription already has its payment recorded.', 'subscription_id');
    }
    const payment = await guardDuplicatePayment(() => subscriptions.insertPayment(instituteId, req, adminId, db));
    await subscriptions.attachPayment(sub.id, payment.id, db);
    return new PaymentDTO({ ...payment, subscription_id: sub.id });
  });
}
