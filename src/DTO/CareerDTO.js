// The Career object in docs/openapi.yaml. Same shape as an entry of the
// frontend's RIASEC_CAREERS, so riasec_engine.js can match against it as-is.
export class CareerDTO {
  constructor(row) {
    this.title = row.title;
    this.emoji = row.emoji;
    this.field = row.field;
    this.family = row.family;
    this.stream = row.stream;
    this.salary = row.salary;
    this.riasec = row.riasec;
    this.domains = row.domains;
    this.subjects = row.subjects;
    this.why = row.why;
  }
}
