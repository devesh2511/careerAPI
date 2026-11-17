// Student registration and login. Returns plain results; the controller
// decides status codes and sets the session cookie from `token`.
//
// Only students on an institute's list can register: they give the name and
// phone the institute gave us, and the institute ID. The first time, they
// choose a username and password and fill in their details (register). A
// student who already has an account, and is on a second institute's list,
// proves it with their existing password instead (link): one account, both
// institutes.
import { withTransaction } from '../Database/db.js';
import * as students from '../Database/student.repository.js';
import * as studentList from '../Database/studentList.repository.js';
import { findJoinableByCode } from '../Database/institute.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { SessionResponse } from '../DTO/SessionResponse.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from './password.service.js';
import { createSession, endSession } from './session.service.js';
import { accessFor } from './access.service.js';
import { toStudentDTO } from './student.service.js';

const notOnList = () => new ApiError(404, 'not_on_list',
  "We couldn't find you on that institute's list. Check your name, phone number and institute ID with your institute.");
const alreadyRegistered = () => new ApiError(409, 'already_registered',
  "You've already registered with this institute. Log in with your username.");
const accountDisabled = () => new ApiError(403, 'account_disabled',
  'Your account has been switched off. Please contact your institute.');

// The institute's list row for this name + phone, locked until `db`'s
// transaction ends. Throws not_on_list.
async function findEntry(req, db) {
  const institute = await findJoinableByCode(req.instituteCode, db);
  if (!institute) throw notOnList();
  const entry = await studentList.findForUpdate({ instituteId: institute.id, name: req.name, phoneNo: req.phoneNo }, db);
  if (!entry) throw notOnList();
  return { institute, entry };
}

async function sessionFor(studentId, userAgent, db) {
  const token = await createSession(studentId, userAgent, db);
  const row = await students.findById(studentId, db);
  return { token, body: new SessionResponse(await toStudentDTO(row, db), await accessFor(studentId, db)) };
}

// req: ListEntryRequest. Step 1 of registration: is this student on the
// list, and do they already have an account (then they link, not register)?
// → { status: 'new' } | { status: 'existing_account', username }
export async function checkEntry(req) {
  return withTransaction(async db => {
    const { entry } = await findEntry(req, db);
    if (entry.metadata_id) throw alreadyRegistered();
    const account = await students.findByPerson({ name: entry.name, phoneNo: entry.phone_no }, db);
    if (!account) return { status: 'new' };
    if (account.is_deleted) throw accountDisabled();
    return { status: 'existing_account', username: account.username };
  });
}

// req: RegisterRequest. Creates the account, links the list row to it and
// starts a session, in one transaction.
export async function register(req, userAgent) {
  // Hash before the transaction: it's the slow part, and needs no locks.
  const passwordHash = await hashPassword(req.password);

  return withTransaction(async db => {
    const { institute, entry } = await findEntry(req, db);
    if (entry.metadata_id) throw alreadyRegistered();
    if (await students.findByPerson({ name: entry.name, phoneNo: entry.phone_no }, db)) {
      throw new ApiError(409, 'account_exists',
        'You already have an account. Enter its password to add this institute to it.');
    }

    let student;
    try {
      student = await students.insertStudent({
        username: req.username, name: entry.name, phoneNo: entry.phone_no, email: req.email,
        passwordHash, ...req.details,
      }, db);
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'user_metadata_username_key') {
        throw new ApiError(409, 'username_taken', 'That username is taken. Try another.', 'username');
      }
      if (err.code === '23505' && err.constraint === 'user_metadata_person_key') {
        throw new ApiError(409, 'account_exists',
          'You already have an account. Enter its password to add this institute to it.');
      }
      throw err;
    }
    if (!(await studentList.claim({ instituteId: institute.id, name: entry.name, phoneNo: entry.phone_no, studentId: student.id }, db))) {
      throw alreadyRegistered();
    }
    await students.refreshInstitutes([student.id], db);
    return sessionFor(student.id, userAgent, db);
  });
}

// req: LinkRequest. Adds this institute's list row to the student's existing
// account, after checking that account's password, and logs them in. The
// frontend then shows their saved details, already filled in.
export async function link(req, userAgent) {
  const account = await students.findByPerson({ name: req.name, phoneNo: req.phoneNo });
  const ok = await verifyPassword(req.password, account ? account.password : DUMMY_HASH);
  if (!account || !ok) {
    throw new ApiError(401, 'bad_credentials', "That password doesn't match your existing account.", 'password');
  }
  if (account.is_deleted) throw accountDisabled();

  return withTransaction(async db => {
    const { institute, entry } = await findEntry(req, db);
    if (entry.metadata_id) throw alreadyRegistered();
    if (!(await studentList.claim({ instituteId: institute.id, name: entry.name, phoneNo: entry.phone_no, studentId: account.id }, db))) {
      throw alreadyRegistered();
    }
    await students.refreshInstitutes([account.id], db);
    await students.touchLastLogin(account.id, db);
    return sessionFor(account.id, userAgent, db);
  });
}

// req: LoginRequest. Same answer for an unknown username, a wrong password
// and a deleted account, and all three take about as long.
export async function login(req, userAgent) {
  const found = await students.findByUsername(req.username);
  const ok = await verifyPassword(req.password, found ? found.password : DUMMY_HASH);
  if (!found || !ok || found.is_deleted) {
    throw new ApiError(401, 'bad_credentials', 'Username or password is incorrect.');
  }
  await students.touchLastLogin(found.id);
  return sessionFor(found.id, userAgent);
}

export async function logout(token) {
  await endSession(token);
}
