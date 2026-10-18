// The AdminRoadmapRow and AdminRoadmap objects in docs/openapi.yaml.

// One career in the admin's roadmap list; roadmap fields are null when it has none.
export class AdminRoadmapRowDTO {
  constructor(row) {
    this.career = row.title;
    this.emoji = row.emoji;
    this.field = row.field;
    this.stream = row.stream;
    this.family = row.family;
    this.has_roadmap = row.version !== null;
    this.step_count = row.step_count;
    this.version = row.version;
    this.updated_at = row.updated_at;
    this.updated_by = row.updated_by;   // the admin's name; null for seeded rows
  }
}

// One career and its roadmap (null when it has none), for the editor.
export class AdminRoadmapDTO {
  constructor(career, roadmap) {
    this.career = {
      title: career.title, emoji: career.emoji, field: career.field,
      stream: career.stream, salary: career.salary,
    };
    this.roadmap = roadmap && {
      steps: roadmap.steps,
      version: roadmap.version,
      updated_at: roadmap.updated_at,
      updated_by: roadmap.updated_by_name,
    };
  }
}
