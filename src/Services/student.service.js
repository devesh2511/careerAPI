// Turning student rows into what the API returns, and the student's own
// career and School ID.
import { findRefById, findJoinableByCode } from '../Database/school.repository.js';
import * as students from '../Database/student.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { StudentDTO } from '../DTO/StudentDTO.js';
import { SessionResponse } from '../DTO/SessionResponse.js';
import { accessFor } from './access.service.js';

export async function toStudentDTO(row, db) {
  const school = row.school_id ? await findRefById(row.school_id, db) : null;
  return new StudentDTO(row, school);
}

// req: CareerRequest.
export async function setCareer(studentId, req) {
  await students.setCareer(studentId, req.career);
}

// req: SchoolCodeRequest. Returns the student and their access afterwards,
// so the paywall knows straight away whether the school covers them.
export async function setSchool(studentId, req) {
  let schoolId = null;
  if (req.schoolCode) {
    const school = await findJoinableByCode(req.schoolCode);
    if (!school) {
      throw new ApiError(400, 'unknown_school_id', "We couldn't find that School ID. Check it with your school.", 'school_code');
    }
    schoolId = school.id;
  }
  const row = await students.setSchool(studentId, schoolId);
  return new SessionResponse(await toStudentDTO(row), await accessFor(studentId));
}
