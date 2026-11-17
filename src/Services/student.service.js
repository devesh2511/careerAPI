// Turning user_metadata rows into what the API returns, and the student's
// own details, career and onboarding answers.
import { withTransaction } from '../Database/db.js';
import { findRefById } from '../Database/institute.repository.js';
import * as students from '../Database/student.repository.js';
import * as profiles from '../Database/profile.repository.js';
import { StudentDTO } from '../DTO/StudentDTO.js';
import { ProfileDTO } from '../DTO/ProfileDTO.js';

export async function toStudentDTO(row, db) {
  const institute = row.institute_id ? await findRefById(row.institute_id, db) : null;
  return new StudentDTO(row, institute);
}

// req: CareerRequest.
export async function setCareer(studentId, req) {
  await students.setCareer(studentId, req.career);
}

// req: AccountRequest. Returns the updated student.
export async function setDetails(studentId, req) {
  return toStudentDTO(await students.setDetails(studentId, req.details));
}

// GET /me/profile. class, board and city are known from registration, so
// there is always a profile; completed_at says whether onboarding is done.
export async function getProfile(studentId, db) {
  const [account, row] = await Promise.all([students.findById(studentId, db), profiles.findByStudent(studentId, db)]);
  return { profile: new ProfileDTO(row, account) };
}

// req: ProfileRequest. Only the answers in the request change.
export async function saveProfile(studentId, req) {
  return withTransaction(async db => {
    if (Object.keys(req.details).length) await students.setDetails(studentId, req.details, db);
    if (Object.keys(req.fields).length) await profiles.upsert(studentId, req.fields, db);
    return getProfile(studentId, db);
  });
}
