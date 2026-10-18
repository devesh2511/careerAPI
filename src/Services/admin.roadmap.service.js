// Admin · Roadmaps: editing any career's roadmap from the admin panel.
// Students see a save straight away (GET /roadmap reads the same table).
import { ApiError } from '../DTO/ApiError.js';
import * as roadmaps from '../Database/roadmap.repository.js';
import * as careers from '../Database/career.repository.js';
import { AdminRoadmapRowDTO, AdminRoadmapDTO } from '../DTO/AdminRoadmapDTO.js';

const changed = () => new ApiError(409, 'roadmap_changed',
  'Someone else changed this roadmap while you were editing. Reload to see their version, then make your changes again.');

async function careerOr404(title) {
  const career = await careers.findByTitle(title);
  if (!career) throw ApiError.notFound('career');
  return career;
}

async function detail(career) {
  return new AdminRoadmapDTO(career, await roadmaps.findForAdmin(career.title));
}

// GET /admin/roadmaps. Every career, with or without a roadmap.
export async function list() {
  const rows = await roadmaps.listForAdmin();
  return { careers: rows.map(row => new AdminRoadmapRowDTO(row)) };
}

// GET /admin/roadmap?career=. careerReq: CareerRequest.
export async function get(careerReq) {
  return detail(await careerOr404(careerReq.career));
}

// PUT /admin/roadmap?career=. req: RoadmapRequest. version null creates the
// first roadmap; otherwise it must still be the saved version.
export async function save(careerReq, req, adminId) {
  const career = await careerOr404(careerReq.career);
  const ok = req.version === null
    ? await roadmaps.insert(career.title, career.emoji, req.steps, adminId)
    : await roadmaps.update(career.title, career.emoji, req.steps, adminId, req.version);
  if (!ok) throw changed();
  return detail(career);
}

// DELETE /admin/roadmap?career=. Students then see "still writing" for it.
export async function remove(careerReq) {
  const career = await careerOr404(careerReq.career);
  if (!await roadmaps.remove(career.title)) throw ApiError.notFound('roadmap');
}
