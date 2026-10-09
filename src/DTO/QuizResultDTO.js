// The QuizResult object in docs/openapi.yaml: one saved career quiz run.
// The raw answers stay on the server; the frontend only re-draws results.
export class QuizResultDTO {
  constructor(row) {
    this.id = Number(row.id);
    this.riasec_pct = row.riasec_pct;
    this.riasec_code = row.riasec_code;
    this.confidence = row.confidence;
    this.top_career = row.top_career;
    this.results = row.results;
    this.engine_version = row.engine_version;
    this.created_at = row.created_at;
  }
}
