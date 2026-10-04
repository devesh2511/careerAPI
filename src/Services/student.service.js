// Turning student rows into what the API returns.
import { findRefById } from '../Database/school.repository.js';
import { StudentDTO } from '../DTO/StudentDTO.js';

export async function toStudentDTO(row, db) {
  const school = row.school_id ? await findRefById(row.school_id, db) : null;
  return new StudentDTO(row, school);
}
