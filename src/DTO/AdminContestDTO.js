// The AdminContest and AdminContestDetail objects in docs/openapi.yaml.
// state and locked are worked out by the query from the database's now().
export class AdminContestDTO {
  constructor(row) {
    this.id = row.id;
    this.opens_at = row.opens_at;
    this.closes_at = row.closes_at;
    this.status = row.status;
    this.state = row.state;
    this.locked = row.locked;
    this.scored_at = row.scored_at;
    this.question_count = row.question_count;
    this.created_by = row.created_by;   // the admin's name
    this.is_deleted = row.is_deleted;
    this.deleted_at = row.deleted_at;
    this.created_at = row.created_at;
  }
}

// With the questions, answers included — admins only.
export class AdminContestDetailDTO extends AdminContestDTO {
  constructor(row, questions) {
    super(row);
    this.questions = questions.map(q => ({
      id: q.id,
      position: q.position,
      area: q.area,
      text: q.text,
      options: q.options,
      correct_index: q.correct_index,
      explanation: q.explanation,
    }));
  }
}
