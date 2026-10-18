// The Profile object in docs/openapi.yaml: the student's onboarding answers.
export class ProfileDTO {
  constructor(row) {
    this.class = row.class;
    this.board = row.board;
    this.medium = row.medium;
    this.city = row.city;
    this.marks = row.marks;
    this.favourite_subjects = row.favourite_subjects;
    this.hobbies = row.hobbies;
    this.dream_job = row.dream_job;
    this.career_preference = row.career_preference;
    this.study_location = row.study_location;
    this.completed_at = row.completed_at;
  }
}
