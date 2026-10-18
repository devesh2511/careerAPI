// The Roadmap object in docs/openapi.yaml: one career's timeline.
export class RoadmapDTO {
  constructor(row) {
    this.career = row.career;
    this.emoji = row.emoji;
    this.steps = row.steps;
    this.updated_at = row.updated_at;
  }
}
