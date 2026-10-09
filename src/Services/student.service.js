// Turning student rows into what the API returns, and the student's career.
import { findRefById } from '../Database/school.repository.js';
import * as students from '../Database/student.repository.js';
import { StudentDTO } from '../DTO/StudentDTO.js';

export async function toStudentDTO(row, db) {
  const school = row.school_id ? await findRefById(row.school_id, db) : null;
  return new StudentDTO(row, school);
}

// req: CareerRequest.
export async function setCareer(studentId, req) {
  await students.setCareer(studentId, req.career);
}
