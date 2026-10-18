// Career roadmaps for app.html#/roadmap.
import { ApiError } from '../DTO/ApiError.js';
import * as roadmaps from '../Database/roadmap.repository.js';
import { RoadmapDTO } from '../DTO/RoadmapDTO.js';

// GET /roadmaps. The careers the picker offers.
export async function listRoadmaps() {
  return { roadmaps: await roadmaps.listCareers() };
}

// GET /roadmap?career=. req: CareerRequest.
export async function getRoadmap(req) {
  const row = await roadmaps.findByCareer(req.career);
  if (!row) throw ApiError.notFound('roadmap');
  return { roadmap: new RoadmapDTO(row) };
}
