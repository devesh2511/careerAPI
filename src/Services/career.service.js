// The career catalogue.
import * as careers from '../Database/career.repository.js';
import { CareerDTO } from '../DTO/CareerDTO.js';

// GET /careers.
export async function listCareers() {
  const rows = await careers.findAll();
  return { careers: rows.map(row => new CareerDTO(row)) };
}
